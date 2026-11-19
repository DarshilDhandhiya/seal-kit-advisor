import crypto from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { Assembly, Conversation, Lead, Message } from '../models/index.js';
import type { TicketReason } from '../models/index.js';
import type { Lang, OutMessage } from '../types.js';
import { strings } from '../lib/i18n.js';
import { extractSerials, SERIAL_EXAMPLE } from '../lib/serial.js';
import { detectLanguageCommand, hasDevanagari, isHumanCommand, isResetCommand, parseAssembly, parseYesNo } from '../lib/assembly.js';
import { mongoCatalogRepo, resolveFitment, type CatalogRepo, type FitmentResult } from './fitment.js';
import { ImageRejected, saveMedia, validateImage } from './media.js';
import { runOcr } from './ocr.js';
import { nextState, type ConversationEvent } from './stateMachine.js';
import { createTicket, makeRef } from './tickets.js';

/**
 * The conversation engine. It is channel-agnostic: the WhatsApp webhook and the browser simulator both
 * call `handleInbound` and then deliver the returned messages over their own channel.
 */
export interface InboundInput {
  waId: string;
  messageId: string;
  channel: 'whatsapp' | 'simulator';
  type: 'text' | 'image' | 'interactive' | 'unsupported';
  text?: string;
  interactiveId?: string;
  profileName?: string;
  image?: { buffer: Buffer; mediaId?: string };
  imageError?: 'too_large' | 'bad_type' | 'download_failed';
}

export interface HandleResult {
  duplicate: boolean;
  inboundId: string;
  conversationId: string;
  state: string;
  replies: Array<{ _id: unknown; messageId: string; payload: OutMessage; text: string }>;
}

const MAX_FAILED_READS = 3;
const clean = (s: string | undefined, max = 500) => (s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const isDupKey = (e: unknown) => (e as { code?: number })?.code === 11000;
const absUrl = (u?: string) => (!u ? undefined : /^https?:\/\//.test(u) ? u : `${config.PUBLIC_BASE_URL.replace(/\/$/, '')}${u}`);

type Conv = InstanceType<typeof Conversation>;
type Ctx = Record<string, any>;

class Turn {
  out: OutMessage[] = [];
  fresh = false; // conversation was closed/finished: this message starts a new lookup
  constructor(
    public conv: Conv,
    public input: InboundInput,
    public inMsg: InstanceType<typeof Message>,
    public repo: CatalogRepo,
  ) {}

  get t() {
    return strings(this.conv.language as Lang);
  }
  get ctx(): Ctx {
    return (this.conv.context ?? {}) as Ctx;
  }
  setCtx(patch: Ctx) {
    this.conv.context = { ...this.ctx, ...patch };
    this.conv.markModified('context');
  }
  say(text: string) {
    this.out.push({ kind: 'text', text });
  }
  apply(event: ConversationEvent, reason?: string) {
    try {
      const next = nextState(this.conv.state as any, event);
      if (next !== this.conv.state) this.conv.stateHistory.push({ state: next, reason: reason ?? event, at: new Date() } as any);
      this.conv.state = next;
    } catch (err) {
      logger.warn({ err: String(err), waId: this.conv.waId }, 'state transition rejected');
    }
  }
  async ticket(reason: TicketReason, detail = '', sku: string | null = null) {
    return createTicket({
      conversationId: this.conv._id,
      waId: this.conv.waId,
      reason,
      detail,
      machineSerial: this.conv.confirmedSerial ?? this.conv.candidateSerial ?? null,
      assemblyCode: this.conv.assemblyCode ?? null,
      suggestedSku: sku,
    });
  }
}

/* ------------------------------------------------------------------ entry point */
export async function handleInbound(input: InboundInput, repo: CatalogRepo = mongoCatalogRepo): Promise<HandleResult> {
  const conv = await Conversation.findOneAndUpdate(
    { waId: input.waId },
    {
      $setOnInsert: { waId: input.waId, channel: input.channel, state: 'awaiting_image', language: 'en', stateHistory: [{ state: 'awaiting_image', reason: 'created', at: new Date() }] },
      ...(input.profileName ? { $set: { profileName: clean(input.profileName, 80) } } : {}),
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  if (!conv) throw new Error('conversation upsert failed');

  // Idempotency: the unique index on messageId makes a redelivered webhook a no-op.
  let inMsg;
  try {
    inMsg = await Message.create({
      conversationId: conv._id,
      waId: conv.waId,
      direction: 'in',
      sender: 'customer',
      messageId: input.messageId,
      type: input.type,
      text: clean(input.text, 2000),
      interactiveId: input.interactiveId ?? null,
      delivery: { status: 'delivered', updatedAt: new Date() },
    });
  } catch (e) {
    if (isDupKey(e)) {
      logger.info({ messageId: input.messageId }, 'duplicate inbound message ignored');
      return { duplicate: true, inboundId: '', conversationId: String(conv._id), state: conv.state, replies: [] };
    }
    throw e;
  }

  const turn = new Turn(conv, input, inMsg, repo);
  conv.lastInboundAt = new Date();
  try {
    await route(turn);
  } catch (err) {
    logger.error({ err, waId: conv.waId }, 'bot error');
    turn.out = [{ kind: 'text', text: 'Sorry, something went wrong on my side. Please try again, or type *human* to talk to our team.' }];
  }

  // Persist outbound messages + conversation
  const replies: HandleResult['replies'] = [];
  for (const m of turn.out) {
    const doc = await Message.create({
      conversationId: conv._id,
      waId: conv.waId,
      direction: 'out',
      sender: 'bot',
      messageId: `out_${crypto.randomUUID()}`,
      type: m.kind === 'text' ? 'text' : m.kind === 'image' ? 'image' : m.kind,
      text: 'text' in m ? m.text : (m as any).caption ?? '',
      payload: m,
      delivery: { status: 'pending', attempts: 0 },
    });
    replies.push({ _id: doc._id, messageId: doc.messageId, payload: m, text: doc.text });
  }
  if (replies.length) conv.lastOutboundAt = new Date();
  inMsg.processedAt = new Date();
  await inMsg.save();
  await conv.save();
  return { duplicate: false, inboundId: String(inMsg._id), conversationId: String(conv._id), state: conv.state, replies };
}

/* ------------------------------------------------------------------ routing */
async function route(c: Turn) {
  const { input, conv } = c;
  const text = clean(input.text);
  const id = input.interactiveId ?? '';

  // Language switch (bonus Hindi)
  const lang = detectLanguageCommand(text);
  if (lang) {
    conv.language = lang;
    c.say(c.t.langSet());
    if (conv.state === 'awaiting_assembly') await sendAssemblyList(c);
    return;
  }
  if (input.type === 'text' && hasDevanagari(text) && conv.language === 'en') conv.language = 'hi';

  // Reset / start over (any state)
  if (id === 'cmd:reset' || (input.type === 'text' && isResetCommand(text))) {
    await resetConversation(c);
    return;
  }
  // Human hand-off (any state)
  if (id === 'cmd:human' || (input.type === 'text' && isHumanCommand(text))) {
    await handoff(c);
    return;
  }

  // New message after a finished conversation starts a fresh lookup
  if (conv.state === 'closed') {
    c.apply('RESET', 'new_message_after_close');
    clearWorkingData(c);
    c.fresh = true;
  }

  if (conv.state === 'human_review') {
    // Staff own the conversation: acknowledge at most once every 10 minutes.
    const last = c.ctx.lastAckAt ? new Date(c.ctx.lastAckAt).getTime() : 0;
    if (Date.now() - last > 10 * 60_000) {
      c.say(c.t.humanAck());
      c.setCtx({ lastAckAt: new Date().toISOString() });
    }
    return;
  }

  if (conv.state === 'awaiting_lead') return handleLead(c, text, id);

  // Unsupported media types (audio, location, documents, stickers...)
  if (input.type === 'unsupported') {
    c.say(c.t.unsupported());
    return;
  }

  // A photo is always (re)interpreted as a new serial candidate
  if (input.type === 'image') return handleImage(c);

  // Interactive buttons first
  if (conv.state === 'awaiting_serial_confirmation' && (id === 'ser:yes' || id === 'ser:no' || id.startsWith('pick:'))) {
    return handleSerialAnswer(c, id);
  }
  if (conv.state === 'awaiting_assembly' && id.startsWith('asm:')) return handleAssemblyChoice(c, id.slice(4) as any);
  if (conv.state === 'recommendation' && id === 'quote:start') return startQuote(c);
  if (conv.state === 'recommendation' && id.startsWith('asm:')) return handleAssemblyChoice(c, id.slice(4) as any);

  // A typed serial (new or corrected) is a new candidate in any non-lead state
  const typed = extractSerials(text);
  if (typed.length > 0 && input.type !== 'interactive') {
    return offerCandidates(c, typed.map((s) => s.serial), typed.some((s) => s.repaired));
  }

  switch (conv.state) {
    case 'awaiting_image':
      return handleAwaitingImageText(c, text);
    case 'awaiting_serial_confirmation': {
      const yn = parseYesNo(text);
      if (yn === 'yes') return handleSerialAnswer(c, 'ser:yes');
      if (yn === 'no') return handleSerialAnswer(c, 'ser:no');
      return repeatSerialPrompt(c);
    }
    case 'awaiting_assembly': {
      const choice = parseAssembly(text);
      if (!choice || choice === 'AMBIGUOUS') return assemblyUnclear(c);
      return handleAssemblyChoice(c, choice);
    }
    case 'recommendation': {
      const choice = parseAssembly(text);
      if (choice && choice !== 'AMBIGUOUS') return handleAssemblyChoice(c, choice);
      return sendRecommendationMenu(c);
    }
  }
}

/* ------------------------------------------------------------------ helpers */
function clearWorkingData(c: Turn) {
  const { conv } = c;
  conv.confirmedSerial = null;
  conv.candidateSerial = null;
  conv.candidateSerials = [] as any;
  conv.assemblyCode = null;
  conv.suggestedSku = null;
  conv.context = {};
  conv.markModified('context');
}

async function resetConversation(c: Turn) {
  c.apply('RESET', 'customer_reset');
  clearWorkingData(c);
  c.say(c.t.welcome());
}

async function handoff(c: Turn) {
  if (c.conv.state === 'human_review') {
    c.say(c.t.humanAck());
    return;
  }
  const tk = await c.ticket('customer_requested', `State when requested: ${c.conv.state}`, c.conv.suggestedSku ?? null);
  c.apply('HANDOFF_REQUESTED', 'customer_requested');
  c.say(c.t.handoff(tk.ref));
}

async function reviewTicket(c: Turn, reason: TicketReason, detail = '', sku: string | null = null, message?: (ref: string) => string) {
  const tk = await c.ticket(reason, detail, sku);
  c.apply('NEEDS_REVIEW', reason);
  c.say(message ? message(tk.ref) : c.t.ticket(reason, tk.ref));
  return tk;
}

async function handleAwaitingImageText(c: Turn, text: string) {
  const greeting = /^(hi|hii|hello|hey|hola|namaste|namaskar|start|नमस्ते|नमस्कार|हैलो|हेलो)\W*$/i.test(text);
  if (greeting || c.fresh || !c.conv.lastOutboundAt || !text) {
    c.say(c.t.welcome());
    return;
  }
  const fails = (c.ctx.failedReads ?? 0) + 1;
  c.setCtx({ failedReads: fails });
  if (fails >= MAX_FAILED_READS) {
    await reviewTicket(c, 'unreadable_photo', `Customer text not recognised as a serial: "${text.slice(0, 120)}"`, null, (ref) => c.t.repeatedFailure(ref));
    return;
  }
  c.say(c.t.typedNotSerial(SERIAL_EXAMPLE));
}

/* ----- serial candidates & confirmation */
function offerCandidates(c: Turn, serials: string[], uncertain: boolean) {
  const unique = [...new Set(serials)].slice(0, 3);
  c.conv.candidateSerials = unique as any;
  c.conv.confirmedSerial = null;
  c.conv.assemblyCode = null;
  c.conv.suggestedSku = null;
  c.setCtx({ failedReads: 0 });
  if (unique.length === 1) {
    c.conv.candidateSerial = unique[0];
    c.apply('SERIAL_CANDIDATE', 'single_candidate');
    c.out.push({
      kind: 'buttons',
      text: c.t.confirmSerial(unique[0], uncertain),
      buttons: [
        { id: 'ser:yes', title: c.t.yes },
        { id: 'ser:no', title: c.t.no },
      ],
    });
  } else {
    c.conv.candidateSerial = null;
    c.apply('SERIAL_CANDIDATE', 'ambiguous_candidates');
    c.out.push({ kind: 'buttons', text: c.t.pickSerial(unique), buttons: unique.map((s) => ({ id: `pick:${s}`, title: s })) });
  }
}

function repeatSerialPrompt(c: Turn) {
  const { conv } = c;
  if (conv.candidateSerial) {
    c.out.push({
      kind: 'buttons',
      text: c.t.confirmSerial(conv.candidateSerial, false),
      buttons: [
        { id: 'ser:yes', title: c.t.yes },
        { id: 'ser:no', title: c.t.no },
      ],
    });
  } else if (conv.candidateSerials.length) {
    c.out.push({ kind: 'buttons', text: c.t.pickSerial([...conv.candidateSerials]), buttons: conv.candidateSerials.map((s) => ({ id: `pick:${s}`, title: s })) });
  } else {
    c.say(c.t.retype());
  }
}

async function handleSerialAnswer(c: Turn, id: string) {
  const { conv } = c;
  if (id === 'ser:no') {
    conv.candidateSerial = null;
    conv.candidateSerials = [] as any;
    c.apply('SERIAL_REJECTED', 'customer_rejected_serial');
    c.say(c.t.retype());
    return;
  }
  let serial: string | null = conv.candidateSerial ?? null;
  if (id.startsWith('pick:')) {
    const picked = id.slice(5);
    if (!conv.candidateSerials.includes(picked)) return repeatSerialPrompt(c);
    serial = picked;
  }
  if (!serial) return repeatSerialPrompt(c);

  // Customer has confirmed the serial -> only now do we look at the catalogue.
  conv.confirmedSerial = serial;
  conv.candidateSerial = null;
  conv.candidateSerials = [] as any;
  const res = await resolveFitment(c.repo, serial, null);
  if (res.outcome === 'human_review_unknown_serial' || !res.machine) {
    c.apply('SERIAL_CONFIRMED_UNKNOWN', 'unknown_serial');
    const tk = await c.ticket('unknown_serial', `Confirmed serial not in catalogue: ${serial}`);
    c.say(c.t.ticket('unknown_serial', tk.ref));
    return;
  }
  c.apply('SERIAL_CONFIRMED_KNOWN', 'serial_confirmed');
  await sendAssemblyList(c, c.t.machineFound(res.machine));
}

/* ----- assembly */
async function sendAssemblyList(c: Turn, prefix?: string) {
  const order = ['BOOM', 'DIPPER', 'BUCKET', 'STAB'];
  const asms = await Assembly.find().lean();
  asms.sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
  const rows = asms.map((a) => ({ id: `asm:${a.code}`, title: c.conv.language === 'hi' && a.labelHi ? a.labelHi : a.label }));
  rows.push({ id: 'asm:UNSURE', title: c.t.askAssembly.unsure, description: c.t.askAssembly.unsureDesc } as any);
  c.out.push({ kind: 'list', text: `${prefix ? prefix + '\n\n' : ''}${c.t.askAssembly.body}`, buttonLabel: c.t.askAssembly.button, rows });
}

async function assemblyUnclear(c: Turn) {
  const n = (c.ctx.unclearAssembly ?? 0) + 1;
  c.setCtx({ unclearAssembly: n });
  if (n >= MAX_FAILED_READS) {
    await reviewTicket(c, 'unknown_assembly', 'Customer could not choose an assembly after 3 attempts');
    return;
  }
  c.say(c.t.assemblyUnclear());
  await sendAssemblyList(c);
}

async function handleAssemblyChoice(c: Turn, choice: string) {
  const { conv } = c;
  if (!conv.confirmedSerial) return repeatSerialPrompt(c);
  if (choice === 'UNSURE') {
    conv.assemblyCode = null;
    await reviewTicket(c, 'unknown_assembly', 'Customer is not sure which assembly leaks');
    return;
  }
  conv.assemblyCode = choice;
  c.setCtx({ unclearAssembly: 0 });
  const res = await resolveFitment(c.repo, conv.confirmedSerial, choice);
  await replyForFitment(c, res);
}

async function replyForFitment(c: Turn, res: FitmentResult) {
  const { conv } = c;
  const lang = conv.language as Lang;
  switch (res.outcome) {
    case 'recommend': {
      const k = res.kit!;
      conv.suggestedSku = k.sku;
      c.apply('RECOMMEND', 'exact_fitment');
      c.out.push({
        kind: 'buttons',
        text: c.t.recommend(res.machine!, res.assembly!, k, res.fitment?.evidenceSource ?? ''),
        headerImage: absUrl(k.imageUrl),
        buttons: recommendationButtons(c),
      });
      return;
    }
    case 'out_of_stock': {
      const k = res.kit!;
      conv.suggestedSku = k.sku;
      const tk = await c.ticket('no_stock', `Kit ${k.sku} has no stock`, k.sku);
      c.apply('RECOMMEND', 'exact_fitment_out_of_stock');
      c.out.push({
        kind: 'buttons',
        text: c.t.outOfStock(res.machine!, res.assembly!, k, tk.ref),
        headerImage: absUrl(k.imageUrl),
        buttons: recommendationButtons(c),
      });
      return;
    }
    case 'human_review_multiple_kits': {
      const skus = (res.candidates ?? []).map((k) => k.sku);
      await reviewTicket(c, 'multiple_kits', `Candidate kits: ${skus.join(', ')}`, null, (ref) => c.t.multipleKits(skus, ref));
      return;
    }
    case 'human_review_inactive_kit':
      await reviewTicket(c, 'inactive_kit', 'Verified fitment points only to inactive/mismatched kits');
      return;
    case 'human_review_unknown_assembly':
      await reviewTicket(c, 'unknown_assembly', 'Assembly code not in catalogue');
      return;
    case 'human_review_unknown_serial':
      await reviewTicket(c, 'unknown_serial', `Serial not in catalogue: ${conv.confirmedSerial}`);
      return;
    case 'ask_assembly':
      await sendAssemblyList(c);
      return;
    case 'human_review_no_fitment':
    default:
      await reviewTicket(c, 'no_fitment', `No active verified fitment for ${conv.confirmedSerial} + ${conv.assemblyCode} (never matched by model)`);
      void lang;
  }
}

function recommendationButtons(c: Turn) {
  return [
    { id: 'quote:start', title: c.t.quote },
    { id: 'cmd:human', title: c.t.human },
    { id: 'cmd:reset', title: c.t.startOver },
  ];
}

function sendRecommendationMenu(c: Turn) {
  c.out.push({
    kind: 'buttons',
    text:
      c.conv.language === 'hi'
        ? 'आप कोटेशन माँग सकते हैं, हमारी टीम से बात कर सकते हैं, या इसी मशीन के लिए दूसरा असेंबली लिखकर जाँच सकते हैं (boom, dipper, bucket, stabilizer)।'
        : 'You can request a quote, talk to our team, or type another assembly (boom, dipper, bucket, stabilizer) to check it for the same machine.',
    buttons: recommendationButtons(c),
  });
}

/* ----- photo */
async function handleImage(c: Turn) {
  const { input, conv, inMsg } = c;
  if (input.imageError === 'too_large' || input.imageError === 'bad_type') {
    c.say(c.t.badImage(input.imageError, Math.round(config.MAX_IMAGE_BYTES / 1024 / 1024)));
    return;
  }
  if (input.imageError === 'download_failed' || !input.image) {
    c.say(c.t.readFailed('error'));
    return;
  }
  let mime: string;
  try {
    mime = validateImage(input.image.buffer);
  } catch (e) {
    if (e instanceof ImageRejected) {
      c.say(c.t.badImage(e.reason, Math.round(config.MAX_IMAGE_BYTES / 1024 / 1024)));
      return;
    }
    throw e;
  }
  const saved = await saveMedia(input.image.buffer, mime);
  inMsg.media = { mediaId: input.image.mediaId, mime, size: saved.size, sha256: saved.sha256, file: saved.file, expiresAt: saved.expiresAt } as any;

  const { result, outcome } = await runOcr(input.image.buffer);
  inMsg.ocr = {
    provider: result?.provider ?? 'error',
    rawText: (result?.text ?? '').slice(0, 2000),
    confidence: result?.confidence ?? 0,
    candidates: outcome.kind === 'confirm' ? [outcome.candidate.serial] : outcome.kind === 'ambiguous' ? outcome.candidates.map((x) => x.serial) : [],
    outcome: outcome.kind === 'confirm' ? (outcome.uncertain ? 'uncertain' : 'confirm') : outcome.kind === 'ambiguous' ? 'ambiguous' : `unreadable:${outcome.reason}`,
    durationMs: result?.durationMs ?? 0,
    imageHash: saved.sha256,
  } as any;

  if (outcome.kind === 'confirm') return offerCandidates(c, [outcome.candidate.serial], outcome.uncertain);
  if (outcome.kind === 'ambiguous') return offerCandidates(c, outcome.candidates.map((x) => x.serial), true);

  // Unreadable: ask for a clearer photo / typed serial; after repeated failures route to staff.
  const fails = (c.ctx.failedReads ?? 0) + 1;
  c.setCtx({ failedReads: fails });
  if (fails >= MAX_FAILED_READS) {
    await reviewTicket(c, 'unreadable_photo', `OCR could not read the plate ${fails} times (last: ${outcome.reason}, conf ${Math.round(outcome.confidence)})`, null, (ref) => c.t.repeatedFailure(ref));
    return;
  }
  c.apply('READ_FAILED', outcome.reason);
  c.say(c.t.readFailed(outcome.reason));
  void conv;
}

/* ----- lead / quote */
function startQuote(c: Turn) {
  c.apply('QUOTE_REQUESTED', 'quote_requested');
  c.setCtx({ leadStep: 'name', leadDraft: {} });
  c.say(c.t.leadName());
}

const isNumericWa = (id: string) => /^\+?\d{8,15}$/.test(id);

async function handleLead(c: Turn, text: string, id: string) {
  const { conv } = c;
  const step: string = c.ctx.leadStep ?? 'name';
  const draft: Ctx = { ...(c.ctx.leadDraft ?? {}) };

  if (step === 'name') {
    const name = clean(text, 80);
    if (name.length < 2 || /^\d+$/.test(name)) return void c.say(c.t.leadName());
    draft.name = name;
    c.setCtx({ leadStep: 'phone', leadDraft: draft });
    if (isNumericWa(conv.waId)) {
      c.out.push({ kind: 'buttons', text: c.t.leadPhone(true), buttons: [{ id: 'lead:usewa', title: c.t.useThisNumber }] });
    } else c.say(c.t.leadPhone(false));
    return;
  }
  if (step === 'phone') {
    let phone = '';
    if (id === 'lead:usewa' && isNumericWa(conv.waId)) phone = conv.waId.startsWith('+') ? conv.waId : `+${conv.waId}`;
    else {
      const digits = text.replace(/[^\d]/g, '');
      if (digits.length >= 8 && digits.length <= 15 && /^[+\d\s\-()]+$/.test(text)) phone = text.trim().startsWith('+') ? `+${digits}` : digits;
    }
    if (!phone) return void c.say(c.t.leadBadPhone());
    draft.phone = phone;
    c.setCtx({ leadStep: 'city', leadDraft: draft });
    c.say(c.t.leadCity());
    return;
  }
  if (step === 'city') {
    const city = clean(text, 60);
    if (city.length < 2 || /^\d+$/.test(city)) return void c.say(c.t.leadCity());
    draft.city = city;
    c.setCtx({ leadStep: 'consent', leadDraft: draft });
    c.out.push({
      kind: 'buttons',
      text: c.t.leadConsent(),
      buttons: [
        { id: 'consent:yes', title: c.t.consentYes },
        { id: 'consent:no', title: c.t.consentNo },
      ],
    });
    return;
  }
  // consent
  const yn = id === 'consent:yes' ? 'yes' : id === 'consent:no' ? 'no' : parseYesNo(text);
  if (yn === 'yes') {
    const ref = makeRef('QR');
    await Lead.create({
      ref,
      customerName: draft.name,
      phone: draft.phone,
      city: draft.city,
      consent: true,
      consentAt: new Date(),
      suggestedSku: conv.suggestedSku ?? null,
      machineSerial: conv.confirmedSerial ?? null,
      assemblyCode: conv.assemblyCode ?? null,
      conversationId: conv._id,
    });
    c.apply('LEAD_COMPLETED', 'lead_saved');
    c.setCtx({ leadStep: null, leadDraft: null });
    c.say(c.t.leadDone(draft.name, ref, draft.phone));
    return;
  }
  if (yn === 'no') {
    c.apply('LEAD_CANCELLED', 'consent_declined');
    c.setCtx({ leadStep: null, leadDraft: null });
    c.say(c.t.leadCancelled());
    sendRecommendationMenu(c);
    return;
  }
  c.out.push({
    kind: 'buttons',
    text: c.t.leadConsent(),
    buttons: [
      { id: 'consent:yes', title: c.t.consentYes },
      { id: 'consent:no', title: c.t.consentNo },
    ],
  });
}
