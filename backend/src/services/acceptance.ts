/**
 * The 10 acceptance cases from the brief, executed through the SAME conversation engine used by WhatsApp
 * and the simulator (real Tesseract OCR on the fixture plates, real MongoDB persistence).
 *   exact match | each assembly option | typed serial | OCR confirmation | uncertain OCR | unknown serial |
 *   same model/different serial | different assembly | no stock | human handoff
 */
import fs from 'node:fs';
import path from 'node:path';
import { Conversation, Lead, Message, ReviewTicket } from '../models/index.js';
import { handleInbound } from './bot.js';
import { deliverReplies, sendStaffMessage } from './delivery.js';

export interface StepResult {
  input: string;
  expected: string;
  actual: string;
  state: string;
  pass: boolean;
}
export interface CaseResult {
  id: number;
  title: string;
  steps: StepResult[];
  checks: Array<{ name: string; pass: boolean; detail: string }>;
  finalState: string;
  pass: boolean;
}

const platesDir = () => path.resolve(process.cwd(), 'fixtures/plates');
const plate = (f: string) => fs.readFileSync(path.join(platesDir(), f));

type Send = { text?: string; buttonId?: string; image?: string };

class Session {
  steps: StepResult[] = [];
  checks: CaseResult['checks'] = [];
  private n = 0;
  constructor(public waId: string) {}

  async send(s: Send, expectContains: Array<string | RegExp>, expectState: string, label?: string) {
    const type = s.image ? 'image' : s.buttonId ? 'interactive' : 'text';
    const r = await handleInbound({
      waId: this.waId,
      messageId: `acc_${this.waId}_${++this.n}_${Date.now()}`,
      channel: 'simulator',
      type,
      text: s.text,
      interactiveId: s.buttonId,
      image: s.image ? { buffer: plate(s.image) } : undefined,
    });
    await deliverReplies(this.waId, 'simulator', r.replies);
    const actual = r.replies
      .map((x) => {
        const p: any = x.payload;
        const extra = p.buttons ? ` [${p.buttons.map((b: any) => b.title).join(' | ')}]` : p.rows ? ` [${p.rows.map((b: any) => b.title).join(' | ')}]` : '';
        return `${x.text}${extra}`;
      })
      .join('\n---\n');
    const missing = expectContains.filter((e) => (typeof e === 'string' ? !actual.includes(e) : !e.test(actual)));
    const pass = missing.length === 0 && r.state === expectState;
    this.steps.push({
      input: label ?? (s.image ? `📷 ${s.image}` : s.buttonId ? `[button ${s.buttonId}]` : `"${s.text}"`),
      expected: `state=${expectState}; reply contains ${expectContains.map(String).join(', ')}`,
      actual: `${actual}${missing.length ? `\n!! missing: ${missing.map(String).join(', ')}` : ''}`,
      state: r.state,
      pass,
    });
    return r;
  }

  check(name: string, pass: boolean, detail = '') {
    this.checks.push({ name, pass, detail });
  }
}

async function cleanup(waIds: string[]) {
  const convs = await Conversation.find({ waId: { $in: waIds } }).select('_id');
  const ids = convs.map((c) => c._id);
  await Promise.all([
    Message.deleteMany({ conversationId: { $in: ids } }),
    ReviewTicket.deleteMany({ conversationId: { $in: ids } }),
    Lead.deleteMany({ conversationId: { $in: ids } }),
    Conversation.deleteMany({ _id: { $in: ids } }),
  ]);
}

async function finish(id: number, title: string, s: Session): Promise<CaseResult> {
  const conv = await Conversation.findOne({ waId: s.waId }).lean();
  const pass = s.steps.every((x) => x.pass) && s.checks.every((c) => c.pass);
  return { id, title, steps: s.steps, checks: s.checks, finalState: conv?.state ?? '?', pass };
}

export async function runAcceptance(log: (m: string) => void = () => undefined): Promise<CaseResult[]> {
  const ids = Array.from({ length: 10 }, (_, i) => `sim-acc${String(i + 1).padStart(2, '0')}`);
  await cleanup(ids);
  const out: CaseResult[] = [];

  /* 1 ─ exact match (photo -> confirm -> assembly -> kit) + quote request */
  {
    const s = new Session(ids[0]);
    await s.send({ text: 'hi' }, ['Seal-Kit Advisor'], 'awaiting_image');
    await s.send({ image: '01_DEMO-BHL-0001_clear.png' }, ['DEMO-BHL-0001', 'Is this correct'], 'awaiting_serial_confirmation');
    await s.send({ buttonId: 'ser:yes' }, ['Serial confirmed', '3DX', 'Which hydraulic assembly'], 'awaiting_assembly');
    await s.send({ buttonId: 'asm:BOOM' }, ['DK-BHL-A-BOOM', '₹1,850', 'In stock', 'confirm before ordering'], 'recommendation');
    await s.send({ buttonId: 'quote:start' }, ['name'], 'awaiting_lead');
    await s.send({ text: 'Ravi Kumar' }, ['phone'], 'awaiting_lead');
    await s.send({ text: '+91 98765 43210' }, ['city'], 'awaiting_lead');
    await s.send({ text: 'Vadodara' }, ['store your name'], 'awaiting_lead');
    await s.send({ buttonId: 'consent:yes' }, ['quote request', 'QR-'], 'closed');
    const lead = await Lead.findOne({ suggestedSku: 'DK-BHL-A-BOOM', machineSerial: 'DEMO-BHL-0001' }).sort({ createdAt: -1 });
    s.check('lead stored with consent + SKU', !!lead && lead.consent === true && lead.city === 'Vadodara', lead?.ref ?? 'none');
    out.push(await finish(1, 'Exact match (photo → confirm → boom → kit → quote)', s));
  }

  /* 2 ─ every assembly option for one machine (+ "not sure") */
  {
    const s = new Session(ids[1]);
    await s.send({ text: 'DEMO-BHL-0001' }, ['DEMO-BHL-0001'], 'awaiting_serial_confirmation');
    await s.send({ text: 'yes' }, ['Which hydraulic assembly'], 'awaiting_assembly');
    await s.send({ buttonId: 'asm:BOOM' }, ['DK-BHL-A-BOOM'], 'recommendation');
    await s.send({ buttonId: 'asm:DIPPER' }, ['DK-BHL-A-DIP'], 'recommendation');
    await s.send({ text: 'bucket' }, ['DK-BHL-A-BKT'], 'recommendation');
    await s.send({ text: 'Stabilizer' }, ['DK-BHL-A-STB'], 'recommendation');
    await s.send({ buttonId: 'cmd:reset' }, ['Seal-Kit Advisor'], 'awaiting_image', 'reset');
    await s.send({ text: 'DEMO-BHL-0001' }, ['DEMO-BHL-0001'], 'awaiting_serial_confirmation');
    await s.send({ buttonId: 'ser:yes' }, ['Which hydraulic assembly'], 'awaiting_assembly');
    await s.send({ buttonId: 'asm:UNSURE' }, ['review ticket', 'TKT-'], 'human_review');
    s.check('"not sure" created unknown_assembly ticket', !!(await ReviewTicket.findOne({ waId: s.waId, reason: 'unknown_assembly' })));
    out.push(await finish(2, 'Each assembly option: boom, dipper, bucket, stabilizer, not sure', s));
  }

  /* 3 ─ typed serial with sloppy formatting */
  {
    const s = new Session(ids[2]);
    await s.send({ text: 'my serial is demo bhl 0003' }, ['*DEMO-BHL-0003*', 'Is this correct'], 'awaiting_serial_confirmation');
    await s.send({ buttonId: 'ser:yes' }, ['4DX'], 'awaiting_assembly');
    await s.send({ text: 'stabiliser' }, ['DK-BHL-A-STB'], 'recommendation');
    out.push(await finish(3, 'Typed serial (lower-case, spaces) → normalised → stabilizer kit', s));
  }

  /* 4 ─ OCR confirmation: customer rejects the echoed serial, then re-sends */
  {
    const s = new Session(ids[3]);
    await s.send({ image: '04_DEMO-BHL-0004_clear.png' }, ['DEMO-BHL-0004', 'Is this correct'], 'awaiting_serial_confirmation');
    await s.send({ buttonId: 'ser:no' }, ['type the serial number'], 'awaiting_image');
    await s.send({ image: '10_DEMO-BHL-0002_rotated.png' }, ['DEMO-BHL-0002'], 'awaiting_serial_confirmation', '📷 10_DEMO-BHL-0002_rotated.png (tilted photo)');
    await s.send({ buttonId: 'ser:yes' }, ['3DX'], 'awaiting_assembly');
    const conv = await Conversation.findOne({ waId: s.waId });
    s.check('confirmedSerial persisted', conv?.confirmedSerial === 'DEMO-BHL-0002', String(conv?.confirmedSerial));
    const ocrMsgs = await Message.find({ conversationId: conv?._id, 'ocr.provider': { $exists: true } });
    s.check('OCR result + image hash stored for audit', ocrMsgs.length === 2 && ocrMsgs.every((m) => !!m.ocr?.imageHash), `${ocrMsgs.length} ocr records`);
    out.push(await finish(4, 'OCR confirmation (echo serial, reject, tilted re-send, confirm)', s));
  }

  /* 5 ─ uncertain / unreadable OCR */
  {
    const s = new Session(ids[4]);
    await s.send({ image: '11_DEMO-BHL-0003_serial_cropped_out.png' }, ["couldn't find a serial", 'clear photo'], 'awaiting_image');
    await s.send({ image: '09_DEMO-BHL-0001_blurred.png' }, ['DEMO-BHL-0001'], 'awaiting_serial_confirmation', '📷 09_DEMO-BHL-0001_blurred.png');
    const conv = await Conversation.findOne({ waId: s.waId });
    const blurred = await Message.findOne({ conversationId: conv?._id, 'media.sha256': { $exists: true } }).sort({ createdAt: -1 });
    s.check('blurred plate is flagged for double-check or sent back (never silently trusted)', ['uncertain', 'confirm'].includes(blurred?.ocr?.outcome ?? ''), `outcome=${blurred?.ocr?.outcome}, conf=${Math.round(blurred?.ocr?.confidence ?? 0)}`);
    await s.send({ buttonId: 'ser:no' }, ['type the serial'], 'awaiting_image');
    await s.send({ image: '11_DEMO-BHL-0003_serial_cropped_out.png' }, ["couldn't find a serial"], 'awaiting_image', '📷 cropped (failure 1)');
    await s.send({ image: '11_DEMO-BHL-0003_serial_cropped_out.png' }, ["couldn't find a serial"], 'awaiting_image', '📷 cropped (failure 2)');
    await s.send({ image: '11_DEMO-BHL-0003_serial_cropped_out.png' }, ['ticket', 'TKT-'], 'human_review', '📷 cropped (failure 3 → staff)');
    s.check('repeated unreadable photos create unreadable_photo ticket', !!(await ReviewTicket.findOne({ waId: s.waId, reason: 'unreadable_photo' })));
    out.push(await finish(5, 'Uncertain / unreadable OCR (cropped, blurred, escalation to staff)', s));
  }

  /* 6 ─ unknown serial */
  {
    const s = new Session(ids[5]);
    await s.send({ text: 'DEMO-UNKNOWN-9999' }, ['DEMO-UNKNOWN-9999', 'Is this correct'], 'awaiting_serial_confirmation');
    await s.send({ buttonId: 'ser:yes' }, ["can't find that serial", 'TKT-'], 'human_review');
    const t = await ReviewTicket.findOne({ waId: s.waId, reason: 'unknown_serial' });
    s.check('unknown_serial ticket created, no SKU suggested', !!t && !t.suggestedSku, t?.ref ?? 'none');
    out.push(await finish(6, 'Unknown serial → staff review ticket (no guess)', s));
  }

  /* 7 ─ same model, different serial => different kit */
  {
    const s = new Session(ids[6]);
    await s.send({ text: 'DEMO-BHL-0001' }, ['DEMO-BHL-0001'], 'awaiting_serial_confirmation');
    await s.send({ buttonId: 'ser:yes' }, ['3DX', 'variant A'], 'awaiting_assembly');
    await s.send({ buttonId: 'asm:BOOM' }, ['DK-BHL-A-BOOM'], 'recommendation');
    await s.send({ text: 'DEMO-BHL-0002' }, ['DEMO-BHL-0002'], 'awaiting_serial_confirmation', 'types another serial of the same model (3DX)');
    await s.send({ buttonId: 'ser:yes' }, ['3DX', 'variant B'], 'awaiting_assembly');
    await s.send({ buttonId: 'asm:BOOM' }, ['DK-BHL-B-BOOM', '₹1,950'], 'recommendation');
    out.push(await finish(7, 'Same model (3DX), different serial → different kit (A vs B)', s));
  }

  /* 8 ─ different assembly: EXC-0008 has no STAB fitment → staff; BUCKET works */
  {
    const s = new Session(ids[7]);
    await s.send({ image: '08_DEMO-EXC-0008_clear.png' }, ['DEMO-EXC-0008'], 'awaiting_serial_confirmation');
    await s.send({ buttonId: 'ser:yes' }, ['JS220'], 'awaiting_assembly');
    await s.send({ buttonId: 'asm:STAB' }, ['verified kit for that exact serial', 'TKT-'], 'human_review');
    const t = await ReviewTicket.findOne({ waId: s.waId, reason: 'no_fitment' });
    s.check('no_fitment ticket (never nearest-model match)', !!t && !t.suggestedSku, t?.ref ?? 'none');
    await s.send({ buttonId: 'cmd:reset' }, ['Seal-Kit Advisor'], 'awaiting_image', 'reset');
    await s.send({ text: 'DEMO-EXC-0008' }, ['DEMO-EXC-0008'], 'awaiting_serial_confirmation');
    await s.send({ buttonId: 'ser:yes' }, ['JS220'], 'awaiting_assembly');
    await s.send({ text: 'bucket' }, ['DK-EXC-B-BKT', '₹2,400'], 'recommendation');
    out.push(await finish(8, 'Different assembly: no fitment → ticket; valid assembly → kit', s));
  }

  /* 9 ─ no stock */
  {
    const s = new Session(ids[8]);
    await s.send({ image: '02_DEMO-BHL-0002_clear.png' }, ['DEMO-BHL-0002'], 'awaiting_serial_confirmation');
    await s.send({ buttonId: 'ser:yes' }, ['3DX'], 'awaiting_assembly');
    const r = await s.send({ text: 'dipper' }, ['DK-BHL-B-DIP', 'out of stock', "can't promise"], 'recommendation');
    s.check('out-of-stock reply never claims "In stock"', !r.replies.some((x) => /In stock/i.test(x.text)));
    s.check('no_stock ticket created for staff', !!(await ReviewTicket.findOne({ waId: s.waId, reason: 'no_stock', suggestedSku: 'DK-BHL-B-DIP' })));
    out.push(await finish(9, 'No stock: kit shown, availability NOT promised, ticket raised', s));
  }

  /* 10 ─ human handoff, staff reply, resolution */
  {
    const s = new Session(ids[9]);
    await s.send({ text: 'DEMO-EXC-0005' }, ['DEMO-EXC-0005'], 'awaiting_serial_confirmation');
    await s.send({ text: 'talk to human' }, ['passed this to our team', 'TKT-'], 'human_review');
    const t = await ReviewTicket.findOne({ waId: s.waId, reason: 'customer_requested' });
    s.check('customer_requested ticket created', !!t, t?.ref ?? 'none');
    await s.send({ text: 'are you there?' }, ['Our team has your message'], 'human_review');
    const conv = await Conversation.findOne({ waId: s.waId });
    const staff = await sendStaffMessage(String(conv?._id), 'Hello, this is the parts desk — please confirm the machine year.', 'acceptance@demo.local');
    s.check('staff reply persisted + delivered over the same channel', !!staff && staff.sender === 'staff' && staff.delivery?.status === 'simulated');
    if (t) {
      await ReviewTicket.updateOne({ _id: t._id }, { $set: { status: 'resolved', resolution: 'Handled by phone', resolvedAt: new Date() } });
      await Conversation.updateOne({ _id: conv?._id }, { $set: { state: 'closed' } });
    }
    await s.send({ text: 'hello again' }, ['Seal-Kit Advisor'], 'awaiting_image', 'new message after resolution');
    out.push(await finish(10, 'Human handoff (ticket, staff reply, resolution, fresh start)', s));
  }

  for (const c of out) log(`${c.pass ? 'PASS' : 'FAIL'}  #${c.id} ${c.title}  → final state: ${c.finalState}`);
  return out;
}

export function renderReport(results: CaseResult[]): string {
  const lines: string[] = [];
  const passed = results.filter((r) => r.pass).length;
  lines.push('# Acceptance report — 10 demo cases', '', `Generated: ${new Date().toISOString()}  `, `Result: **${passed}/${results.length} cases passed**`, '');
  lines.push('> All data is FICTIONAL demo data. Replies below are the real output of the conversation engine (real Tesseract.js OCR on the fixture plates, MongoDB persistence).', '');
  lines.push('| # | Case | Final persisted state | Result |', '|---|------|-----------------------|--------|');
  for (const r of results) lines.push(`| ${r.id} | ${r.title} | \`${r.finalState}\` | ${r.pass ? '✅ PASS' : '❌ FAIL'} |`);
  for (const r of results) {
    lines.push('', `## Case ${r.id}: ${r.title}`, '');
    for (const [i, s] of r.steps.entries()) {
      lines.push(`**Step ${i + 1}** — customer: ${s.input}  ${s.pass ? '✅' : '❌'}`, `- Expected: ${s.expected}`, `- Persisted state: \`${s.state}\``, '- Bot reply:', '', ...s.actual.split('\n').map((l) => `  > ${l}`), '');
    }
    if (r.checks.length) {
      lines.push('**Persistence / rule checks**', '');
      for (const c of r.checks) lines.push(`- ${c.pass ? '✅' : '❌'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
    }
  }
  return lines.join('\n') + '\n';
}
