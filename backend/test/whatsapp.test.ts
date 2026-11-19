import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildPayload, downloadMedia, MediaError, parseWebhook, sendMessage, signBody, verifySignature } from '../src/services/whatsappClient.js';
import { plate } from './helpers.js';

const sample = (n: string) => JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '../docs/webhook-samples', n), 'utf8'));
const res = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('signature verification', () => {
  const raw = Buffer.from('{"a":1}');
  it('accepts a correct HMAC-SHA256 signature', () => expect(verifySignature(raw, signBody(raw, 's3cret'), 's3cret')).toBe(true));
  it('rejects wrong secret, tampered body, missing/garbled header', () => {
    expect(verifySignature(raw, signBody(raw, 'other'), 's3cret')).toBe(false);
    expect(verifySignature(Buffer.from('{"a":2}'), signBody(raw, 's3cret'), 's3cret')).toBe(false);
    expect(verifySignature(raw, undefined, 's3cret')).toBe(false);
    expect(verifySignature(raw, 'sha256=zzzz', 's3cret')).toBe(false);
    expect(verifySignature(raw, signBody(raw, 's3cret').replace('sha256=', ''), 's3cret')).toBe(false);
  });
});

describe('webhook payload parsing (docs/webhook-samples)', () => {
  it('text', () => {
    const { messages } = parseWebhook(sample('text-message.json'));
    expect(messages).toEqual([{ waId: '919999900001', messageId: 'wamid.DEMO_TEXT_0001', type: 'text', text: 'DEMO-BHL-0001', profileName: 'Demo Customer' }]);
  });
  it('image', () => {
    const [m] = parseWebhook(sample('image-message.json')).messages;
    expect(m.type).toBe('image');
    expect(m.mediaId).toBe('plate-01');
  });
  it('button + list replies', () => {
    expect(parseWebhook(sample('button-reply-confirm.json')).messages[0]).toMatchObject({ type: 'interactive', interactiveId: 'ser:yes' });
    expect(parseWebhook(sample('list-reply-boom.json')).messages[0]).toMatchObject({ type: 'interactive', interactiveId: 'asm:BOOM' });
  });
  it('unsupported types and status events', () => {
    expect(parseWebhook(sample('unsupported-audio.json')).messages[0].type).toBe('unsupported');
    const { messages, statuses } = parseWebhook(sample('status-delivered.json'));
    expect(messages).toHaveLength(0);
    expect(statuses[0]).toMatchObject({ status: 'delivered' });
  });
  it('ignores junk', () => {
    expect(parseWebhook(null)).toEqual({ messages: [], statuses: [] });
    expect(parseWebhook({ object: 'page' })).toEqual({ messages: [], statuses: [] });
    expect(parseWebhook({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ nofrom: 1 }] } }] }] }).messages).toHaveLength(0);
  });
});

describe('outbound payloads respect WhatsApp limits', () => {
  it('buttons: max 3, title <= 20, optional image header', () => {
    const p: any = buildPayload('91', { kind: 'buttons', text: 'x'.repeat(2000), headerImage: 'https://x/y.png', buttons: [1, 2, 3, 4].map((i) => ({ id: `b${i}`, title: 'T'.repeat(40) })) });
    expect(p.interactive.action.buttons).toHaveLength(3);
    expect(p.interactive.action.buttons[0].reply.title.length).toBeLessThanOrEqual(20);
    expect(p.interactive.body.text.length).toBeLessThanOrEqual(1024);
    expect(p.interactive.header.image.link).toBe('https://x/y.png');
  });
  it('list: max 10 rows, title <= 24', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, title: 'R'.repeat(50) }));
    const p: any = buildPayload('91', { kind: 'list', text: 'hi', buttonLabel: 'Choose something long', rows });
    expect(p.interactive.action.sections[0].rows).toHaveLength(10);
    expect(p.interactive.action.sections[0].rows[0].title.length).toBeLessThanOrEqual(24);
    expect(p.interactive.action.button.length).toBeLessThanOrEqual(20);
  });
  it('text', () => expect((buildPayload('91', { kind: 'text', text: 'hello' }) as any).text.body).toBe('hello'));
});

describe('sending with retries', () => {
  const noSleep = vi.fn(async () => undefined);
  it('succeeds first time', async () => {
    const f = vi.fn(async () => res(200, { messages: [{ id: 'wamid.OK' }] }));
    const r = await sendMessage('91', { kind: 'text', text: 'hi' }, { fetchImpl: f as any, sleep: noSleep });
    expect(r).toMatchObject({ ok: true, wamid: 'wamid.OK', attempts: 1 });
  });
  it('retries 429 honouring Retry-After, then succeeds', async () => {
    const sleep = vi.fn(async () => undefined);
    const f = vi.fn().mockResolvedValueOnce(res(429, 'slow down', { 'retry-after': '2' })).mockResolvedValueOnce(res(200, { messages: [{ id: 'wamid.2' }] }));
    const r = await sendMessage('91', { kind: 'text', text: 'hi' }, { fetchImpl: f as any, sleep });
    expect(r).toMatchObject({ ok: true, attempts: 2 });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect((sleep.mock.calls[0] as unknown as number[])[0]).toBeGreaterThanOrEqual(2000);
  });
  it('retries 5xx and network errors, gives up after max attempts', async () => {
    const f = vi.fn().mockResolvedValueOnce(res(503)).mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValue(res(500, 'boom'));
    const r = await sendMessage('91', { kind: 'text', text: 'hi' }, { fetchImpl: f as any, sleep: noSleep, maxAttempts: 4 });
    expect(r.ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(4);
    expect(r.error).toMatch(/500/);
  });
  it('does NOT retry 4xx client errors', async () => {
    const f = vi.fn(async () => res(400, { error: { message: 'bad' } }));
    const r = await sendMessage('91', { kind: 'text', text: 'hi' }, { fetchImpl: f as any, sleep: noSleep });
    expect(r.ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('inbound media download', () => {
  const png = plate('01_DEMO-BHL-0001_clear.png');
  const ok = (meta: object, bin: Buffer = png) =>
    vi.fn(async (url: string) => (String(url).includes('/media/') ? new Response(new Uint8Array(bin), { status: 200, headers: { 'content-type': 'image/png' } }) : res(200, { url: 'http://graph.test/media/x', ...meta })));
  it('downloads an allowed image', async () => {
    const d = await downloadMedia('plate-01', ok({ mime_type: 'image/png', file_size: png.length }) as any);
    expect(d.buffer.equals(png)).toBe(true);
  });
  it('rejects disallowed mime types before downloading', async () => {
    await expect(downloadMedia('x', ok({ mime_type: 'application/pdf', file_size: 10 }) as any)).rejects.toMatchObject({ reason: 'bad_type' });
  });
  it('rejects oversized files from metadata and from the real byte count', async () => {
    await expect(downloadMedia('x', ok({ mime_type: 'image/png', file_size: 50_000_000 }) as any)).rejects.toMatchObject({ reason: 'too_large' });
    await expect(downloadMedia('x', ok({ mime_type: 'image/png' }, Buffer.alloc(6 * 1024 * 1024, 1)) as any)).rejects.toBeInstanceOf(MediaError);
  });
  it('maps HTTP failures to download_failed', async () => {
    await expect(downloadMedia('x', (async () => res(404)) as any)).rejects.toMatchObject({ reason: 'download_failed' });
  });
});
