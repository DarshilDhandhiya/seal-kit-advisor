import crypto from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { OutMessage } from '../types.js';
import { ALLOWED_MIME } from './media.js';

/* ------------------------------------------------------------------ webhook verification */
export function verifySignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const given = header.slice('sha256='.length);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'));
}

export function signBody(rawBody: Buffer | string, appSecret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
}

/* ------------------------------------------------------------------ payload parsing */
export interface ParsedMessage {
  waId: string;
  messageId: string;
  type: 'text' | 'image' | 'interactive' | 'unsupported';
  text?: string;
  interactiveId?: string;
  mediaId?: string;
  profileName?: string;
}
export interface ParsedStatus {
  id: string;
  status: string;
  recipientId?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

export function parseWebhook(body: any): { messages: ParsedMessage[]; statuses: ParsedStatus[] } {
  const messages: ParsedMessage[] = [];
  const statuses: ParsedStatus[] = [];
  if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return { messages, statuses };
  for (const entry of body.entry) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value;
      if (!v) continue;
      const names: Record<string, string> = {};
      for (const c of v.contacts ?? []) if (c?.wa_id) names[c.wa_id] = c?.profile?.name ?? '';
      for (const m of v.messages ?? []) {
        if (!m?.id || !m?.from) continue;
        const base = { waId: String(m.from), messageId: String(m.id), profileName: names[m.from] };
        if (m.type === 'text') messages.push({ ...base, type: 'text', text: m.text?.body ?? '' });
        else if (m.type === 'image') messages.push({ ...base, type: 'image', mediaId: m.image?.id, text: m.image?.caption ?? '' });
        else if (m.type === 'interactive') {
          const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
          messages.push({ ...base, type: 'interactive', interactiveId: r?.id, text: r?.title ?? '' });
        } else if (m.type === 'button') messages.push({ ...base, type: 'interactive', interactiveId: m.button?.payload, text: m.button?.text ?? '' });
        else messages.push({ ...base, type: 'unsupported' });
      }
      for (const s of v.statuses ?? []) if (s?.id) statuses.push({ id: s.id, status: s.status, recipientId: s.recipient_id, errors: s.errors });
    }
  }
  return { messages, statuses };
}

/* ------------------------------------------------------------------ Cloud API calls */
type FetchFn = typeof fetch;
const base = () => `${config.WHATSAPP_GRAPH_URL.replace(/\/$/, '')}/${config.WHATSAPP_API_VERSION}`;
const authHeaders = () => ({ Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}` });

export class MediaError extends Error {
  constructor(public reason: 'too_large' | 'bad_type' | 'download_failed', msg?: string) {
    super(msg ?? reason);
  }
}

/** Download an authorised inbound image by media id; enforces type and size limits. */
export async function downloadMedia(mediaId: string, fetchImpl: FetchFn = fetch): Promise<{ buffer: Buffer; mime: string }> {
  try {
    const metaRes = await fetchImpl(`${base()}/${encodeURIComponent(mediaId)}`, { headers: authHeaders(), signal: AbortSignal.timeout(15000) });
    if (!metaRes.ok) throw new MediaError('download_failed', `media meta ${metaRes.status}`);
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string; file_size?: number };
    if (!meta.url) throw new MediaError('download_failed', 'no media url');
    if (meta.mime_type && !(ALLOWED_MIME as readonly string[]).includes(meta.mime_type)) throw new MediaError('bad_type');
    if (meta.file_size && meta.file_size > config.MAX_IMAGE_BYTES) throw new MediaError('too_large');

    const res = await fetchImpl(meta.url, { headers: authHeaders(), signal: AbortSignal.timeout(30000) });
    if (!res.ok || !res.body) throw new MediaError('download_failed', `media download ${res.status}`);
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > config.MAX_IMAGE_BYTES) throw new MediaError('too_large');
    const chunks: Buffer[] = [];
    let total = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > config.MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new MediaError('too_large');
      }
      chunks.push(Buffer.from(value));
    }
    return { buffer: Buffer.concat(chunks), mime: meta.mime_type ?? res.headers.get('content-type') ?? '' };
  } catch (e) {
    if (e instanceof MediaError) throw e;
    throw new MediaError('download_failed', String(e));
  }
}

const cut = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + '…');

/** Build a Cloud API message body (respecting WhatsApp length limits). */
export function buildPayload(to: string, m: OutMessage) {
  const common = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
  if (m.kind === 'text') return { ...common, type: 'text', text: { body: cut(m.text, 4000), preview_url: false } };
  if (m.kind === 'image') return { ...common, type: 'image', image: { link: m.url, caption: m.caption ? cut(m.caption, 1000) : undefined } };
  if (m.kind === 'buttons') {
    return {
      ...common,
      type: 'interactive',
      interactive: {
        type: 'button',
        ...(m.headerImage ? { header: { type: 'image', image: { link: m.headerImage } } } : {}),
        body: { text: cut(m.text, 1024) },
        action: { buttons: m.buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: cut(b.id, 256), title: cut(b.title, 20) } })) },
      },
    };
  }
  return {
    ...common,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: cut(m.text, 1024) },
      action: {
        button: cut(m.buttonLabel, 20),
        sections: [{ title: 'Options', rows: m.rows.slice(0, 10).map((r) => ({ id: cut(r.id, 200), title: cut(r.title, 24), ...(r.description ? { description: cut(r.description, 72) } : {}) })) }],
      },
    },
  };
}

export interface SendResult {
  ok: boolean;
  wamid?: string;
  attempts: number;
  error?: string;
}
export interface SendOptions {
  fetchImpl?: FetchFn;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
}
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Send with retry on 429/5xx/network errors, honouring Retry-After, with exponential backoff + jitter. */
export async function sendMessage(to: string, m: OutMessage, opts: SendOptions = {}): Promise<SendResult> {
  const f = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const max = opts.maxAttempts ?? config.SEND_MAX_ATTEMPTS;
  const url = `${base()}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const body = JSON.stringify(buildPayload(to, m));
  let lastError = '';
  for (let attempt = 1; attempt <= max; attempt++) {
    let retryAfterMs = 0;
    let retryable = false;
    try {
      const res = await f(url, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const j = (await res.json()) as { messages?: Array<{ id: string }> };
        return { ok: true, wamid: j.messages?.[0]?.id, attempts: attempt };
      }
      const txt = await res.text().catch(() => '');
      lastError = `HTTP ${res.status} ${txt.slice(0, 300)}`;
      retryable = res.status === 429 || res.status >= 500;
      const ra = Number(res.headers.get('retry-after'));
      if (ra > 0) retryAfterMs = Math.min(ra * 1000, 60_000);
    } catch (e) {
      lastError = `network: ${String(e)}`;
      retryable = true;
    }
    logger.warn({ attempt, max, lastError, retryable }, 'WhatsApp send failed');
    if (!retryable || attempt === max) break;
    const backoff = Math.min(500 * 2 ** (attempt - 1), 15_000) + Math.floor(Math.random() * 250);
    await sleep(Math.max(backoff, retryAfterMs));
  }
  return { ok: false, attempts: max, error: lastError };
}
