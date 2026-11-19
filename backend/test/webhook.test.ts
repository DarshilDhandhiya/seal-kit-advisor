import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { Conversation, Message } from '../src/models/index.js';
import { drainWebhookQueue } from '../src/routes/webhook.js';
import { setOcrProvider } from '../src/services/ocr.js';
import { signBody } from '../src/services/whatsappClient.js';
import { hasDb, setupDb, teardownDb } from './db.js';
import { plate } from './helpers.js';

const d = hasDb ? describe : describe.skip;
const SECRET = 'test-app-secret';
const URL = '/api/webhooks/whatsapp';

const wrap = (value: object) => ({ object: 'whatsapp_business_account', entry: [{ id: 'W', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', ...value } }] }] });
const msg = (from: string, id: string, rest: object) => wrap({ contacts: [{ profile: { name: 'Tester' }, wa_id: from }], messages: [{ from, id, timestamp: '1', ...rest }] });
const text = (from: string, id: string, body: string) => msg(from, id, { type: 'text', text: { body } });
const button = (from: string, id: string, bid: string) => msg(from, id, { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: bid, title: bid } } });

const post = (app: any, body: object, secret = SECRET) => {
  const raw = JSON.stringify(body);
  return request(app).post(URL).set('Content-Type', 'application/json').set('X-Hub-Signature-256', signBody(raw, secret)).send(raw);
};

d('WhatsApp webhook (Cloud API)', () => {
  const app = createApp();
  let graphPosts: any[] = [];
  let failSends = false;

  beforeAll(setupDb);
  afterAll(teardownDb);
  beforeEach(() => {
    graphPosts = [];
    failSends = false;
    const png = plate('04_DEMO-BHL-0004_clear.png');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: any) => {
        const u = String(url);
        if (u.includes('/messages')) {
          graphPosts.push(JSON.parse(init.body));
          if (failSends) return new Response('server error', { status: 500 });
          return new Response(JSON.stringify({ messages: [{ id: `wamid.OUT_${graphPosts.length}_${Math.random().toString(36).slice(2, 8)}` }] }), { status: 200 });
        }
        if (u.includes('/media/')) return new Response(new Uint8Array(png), { status: 200, headers: { 'content-type': 'image/png' } });
        if (u.includes('/BIGMEDIA')) return new Response(JSON.stringify({ url: 'http://graph.test/media/big', mime_type: 'image/png', file_size: 99_000_000 }), { status: 200 });
        if (u.includes('/PDFMEDIA')) return new Response(JSON.stringify({ url: 'http://graph.test/media/pdf', mime_type: 'application/pdf', file_size: 100 }), { status: 200 });
        return new Response(JSON.stringify({ url: 'http://graph.test/media/x', mime_type: 'image/png', file_size: png.length }), { status: 200 });
      }),
    );
    setOcrProvider({ name: 'test-ocr', recognize: async () => ({ text: 'DEMO PLATE\nMODEL 4DX\nSERIAL DEMO-BHL-0004', confidence: 91, provider: 'test-ocr', durationMs: 3 }) });
  });
  afterEach(async () => {
    await drainWebhookQueue();
    vi.unstubAllGlobals();
    setOcrProvider(null);
  });

  it('GET handshake: right token echoes the challenge, wrong token => 403', async () => {
    const ok = await request(app).get(URL).query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'test-verify-token', 'hub.challenge': '12345' });
    expect(ok.status).toBe(200);
    expect(ok.text).toBe('12345');
    expect((await request(app).get(URL).query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '1' })).status).toBe(403);
    expect((await request(app).get(URL)).status).toBe(403);
  });

  it('POST: missing / wrong / tampered signature => 401 and nothing is processed', async () => {
    const body = text('919000000001', 'wamid.SIG_1', 'DEMO-BHL-0001');
    expect((await request(app).post(URL).set('Content-Type', 'application/json').send(body)).status).toBe(401);
    expect((await post(app, body, 'wrong-secret')).status).toBe(401);
    const raw = JSON.stringify(body);
    const tampered = await request(app).post(URL).set('Content-Type', 'application/json').set('X-Hub-Signature-256', signBody(raw, SECRET)).send(raw.replace('0001', '0002'));
    expect(tampered.status).toBe(401);
    await drainWebhookQueue();
    expect(await Message.countDocuments({ messageId: 'wamid.SIG_1' })).toBe(0);
  });

  it('valid text message: acks 200, saves inbound, replies over the Cloud API, records delivery', async () => {
    const r = await post(app, text('919000000002', 'wamid.TXT_1', 'demo bhl 0001'));
    expect(r.status).toBe(200);
    await drainWebhookQueue();
    const conv = await Conversation.findOne({ waId: '919000000002' });
    expect(conv?.state).toBe('awaiting_serial_confirmation');
    expect(conv?.candidateSerial).toBe('DEMO-BHL-0001');
    expect(conv?.channel).toBe('whatsapp');
    expect(graphPosts).toHaveLength(1);
    expect(graphPosts[0]).toMatchObject({ messaging_product: 'whatsapp', to: '919000000002', type: 'interactive' });
    expect(graphPosts[0].interactive.action.buttons.map((b: any) => b.reply.id)).toEqual(['ser:yes', 'ser:no']);
    const out = await Message.findOne({ conversationId: conv?._id, direction: 'out' });
    expect(out?.delivery?.status).toBe('sent');
    expect(out?.waMessageId).toMatch(/^wamid\.OUT_/);
  });

  it('IDEMPOTENT: the same wamid delivered 3× (even concurrently) is processed once', async () => {
    const body = text('919000000003', 'wamid.IDEM_1', 'DEMO-BHL-0002');
    const rs = await Promise.all([post(app, body), post(app, body), post(app, body)]);
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
    await drainWebhookQueue();
    await post(app, body); // and once more, later
    await drainWebhookQueue();
    const conv = await Conversation.findOne({ waId: '919000000003' });
    expect(await Message.countDocuments({ conversationId: conv?._id, direction: 'in' })).toBe(1);
    expect(await Message.countDocuments({ conversationId: conv?._id, direction: 'out' })).toBe(1);
    expect(graphPosts).toHaveLength(1);
  });

  it('messages from one user are processed in order (even if sent in one batch)', async () => {
    const from = '919000000004';
    const v = (id: string, rest: object) => ({ from, id, timestamp: '1', ...rest });
    const body = wrap({
      messages: [
        v('wamid.ORD_1', { type: 'text', text: { body: 'DEMO-BHL-0003' } }),
        v('wamid.ORD_2', { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'ser:yes', title: 'Yes' } } }),
        v('wamid.ORD_3', { type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'asm:STAB', title: 'Stabilizer' } } }),
      ],
    });
    await post(app, body);
    await drainWebhookQueue();
    const conv = await Conversation.findOne({ waId: from });
    expect(conv?.state).toBe('recommendation');
    expect(conv?.suggestedSku).toBe('DK-BHL-A-STB');
    expect(conv?.stateHistory.map((h) => h.state)).toEqual(['awaiting_image', 'awaiting_serial_confirmation', 'awaiting_assembly', 'recommendation']);
  });

  it('image: authorised download -> validation -> encrypted storage -> OCR -> confirmation prompt', async () => {
    await post(app, msg('919000000005', 'wamid.IMG_1', { type: 'image', image: { id: 'MEDIA1', mime_type: 'image/png' } }));
    await drainWebhookQueue();
    const conv = await Conversation.findOne({ waId: '919000000005' });
    expect(conv?.state).toBe('awaiting_serial_confirmation');
    expect(conv?.candidateSerial).toBe('DEMO-BHL-0004');
    const inbound = await Message.findOne({ conversationId: conv?._id, direction: 'in' });
    expect(inbound?.media?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(inbound?.media?.expiresAt?.getTime()).toBeGreaterThan(Date.now());
    expect(inbound?.ocr?.outcome).toBe('confirm');
    expect(inbound?.ocr?.imageHash).toBe(inbound?.media?.sha256);
    const stored = fs.readFileSync(path.resolve(process.env.MEDIA_DIR!, inbound!.media!.file!));
    expect(stored.equals(plate('04_DEMO-BHL-0004_clear.png'))).toBe(false); // encrypted at rest
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const mediaCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/media/'));
    expect((mediaCall?.[1] as any).headers.Authorization).toBe('Bearer test-access-token'); // authorised download
  });

  it('rejects oversize / wrong-type media politely and keeps state', async () => {
    await post(app, msg('919000000006', 'wamid.BIG_1', { type: 'image', image: { id: 'BIGMEDIA', mime_type: 'image/png' } }));
    await post(app, msg('919000000006', 'wamid.PDF_1', { type: 'image', image: { id: 'PDFMEDIA', mime_type: 'application/pdf' } }));
    await drainWebhookQueue();
    const conv = await Conversation.findOne({ waId: '919000000006' });
    expect(conv?.state).toBe('awaiting_image');
    expect(graphPosts.map((p) => p.text?.body).join('\n')).toMatch(/too large/);
    expect(graphPosts.map((p) => p.text?.body).join('\n')).toMatch(/JPEG, PNG or WEBP/);
    expect(await Message.countDocuments({ conversationId: conv?._id, 'media.file': { $ne: null } })).toBe(0);
  });

  it('unsupported message types (audio) get a helpful reply', async () => {
    await post(app, msg('919000000007', 'wamid.AUD_1', { type: 'audio', audio: { id: 'a' } }));
    await drainWebhookQueue();
    expect(graphPosts[0].text.body).toMatch(/text messages and photos/);
  });

  it('delivery status webhooks update the message; out-of-order statuses never regress', async () => {
    await post(app, text('919000000008', 'wamid.ST_1', 'DEMO-BHL-0001'));
    await drainWebhookQueue();
    const conv = await Conversation.findOne({ waId: '919000000008' });
    const out = await Message.findOne({ conversationId: conv?._id, direction: 'out' });
    const status = (s: string, extra: object = {}) => post(app, wrap({ statuses: [{ id: out!.waMessageId, status: s, recipient_id: '919000000008', ...extra }] }));
    await status('delivered');
    await drainWebhookQueue();
    expect((await Message.findById(out!._id))?.delivery?.status).toBe('delivered');
    await status('read');
    await drainWebhookQueue();
    expect((await Message.findById(out!._id))?.delivery?.status).toBe('read');
    await status('sent'); // late
    await drainWebhookQueue();
    expect((await Message.findById(out!._id))?.delivery?.status).toBe('read');
    await status('failed', { errors: [{ code: 131026, title: 'Message undeliverable' }] });
    await drainWebhookQueue();
    const f = await Message.findById(out!._id);
    expect(f?.delivery?.status).toBe('failed');
    expect(f?.delivery?.error).toMatch(/131026/);
  });

  it('Cloud API failures are retried, then logged as failed — the conversation still advances', async () => {
    failSends = true;
    await post(app, text('919000000009', 'wamid.FAIL_1', 'DEMO-BHL-0001'));
    await drainWebhookQueue();
    const conv = await Conversation.findOne({ waId: '919000000009' });
    expect(conv?.state).toBe('awaiting_serial_confirmation');
    expect(graphPosts.length).toBe(2); // SEND_MAX_ATTEMPTS=2
    const out = await Message.findOne({ conversationId: conv?._id, direction: 'out' });
    expect(out?.delivery?.status).toBe('failed');
    expect(out?.delivery?.attempts).toBe(2);
  });

  it('refuses unsigned webhooks when no app secret is configured (unless explicitly allowed)', async () => {
    const { config } = await import('../src/config.js');
    const saved = config.WHATSAPP_APP_SECRET;
    (config as any).WHATSAPP_APP_SECRET = undefined;
    try {
      const r = await request(app).post(URL).set('Content-Type', 'application/json').send(text('919000000010', 'wamid.NOSEC_1', 'hi'));
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe('NO_APP_SECRET');
    } finally {
      (config as any).WHATSAPP_APP_SECRET = saved;
    }
  });
});
