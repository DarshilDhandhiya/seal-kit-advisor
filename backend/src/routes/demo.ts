import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';
import { conversationQueue } from '../lib/queue.js';
import { Conversation, Message } from '../models/index.js';
import { handleInbound } from '../services/bot.js';
import { deliverReplies } from '../services/delivery.js';

/**
 * Browser simulator API: uses exactly the same bot workflow (handleInbound) as the WhatsApp webhook,
 * so every flow can be tested without Meta credentials.
 */
export const demoRouter = Router();

const limiter = rateLimit({ windowMs: 60_000, limit: Number(process.env.DEMO_RATE_LIMIT ?? 240), standardHeaders: true, legacyHeaders: false });
demoRouter.use(limiter);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.MAX_IMAGE_BYTES, files: 1, fields: 10 } });
const WA_ID = /^sim-[a-z0-9]{6,32}$/;

export const snapshot = (c: any) => ({
  id: String(c._id),
  waId: c.waId,
  channel: c.channel,
  state: c.state,
  language: c.language,
  confirmedSerial: c.confirmedSerial ?? null,
  candidateSerial: c.candidateSerial ?? null,
  assemblyCode: c.assemblyCode ?? null,
  suggestedSku: c.suggestedSku ?? null,
});

const publicMsg = (m: any) => ({
  id: String(m._id),
  direction: m.direction,
  sender: m.sender,
  type: m.type,
  text: m.text,
  payload: m.payload ?? null,
  interactiveId: m.interactiveId ?? null,
  hasImage: Boolean(m.media?.mime),
  delivery: m.delivery?.status ?? null,
  createdAt: m.createdAt,
});

const bodySchema = z.object({
  waId: z.string().regex(WA_ID, 'waId must look like sim-abc123'),
  text: z.string().max(2000).optional(),
  buttonId: z.string().max(256).optional(),
  messageId: z.string().max(100).optional(),
});

function parseUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('image')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      (req as any).imageTooLarge = true;
      return next();
    }
    next(err);
  });
}

demoRouter.post('/messages', parseUpload, async (req, res) => {
  const body = bodySchema.parse(req.body ?? {});
  const file = req.file;
  const tooLarge = Boolean((req as any).imageTooLarge);
  if (!file && !tooLarge && !body.text?.trim() && !body.buttonId) throw badRequest('Send text, buttonId or an image');

  const type = file || tooLarge ? 'image' : body.buttonId ? 'interactive' : 'text';
  const result = await conversationQueue.run(body.waId, async () => {
    const r = await handleInbound({
      waId: body.waId,
      messageId: body.messageId ? `sim_${body.waId}_${body.messageId}` : `sim_${crypto.randomUUID()}`,
      channel: 'simulator',
      type,
      text: body.text,
      interactiveId: body.buttonId,
      image: file ? { buffer: file.buffer } : undefined,
      imageError: tooLarge ? 'too_large' : undefined,
    });
    if (!r.duplicate) await deliverReplies(body.waId, 'simulator', r.replies);
    return r;
  });
  const conv = await Conversation.findOne({ waId: body.waId }).lean();
  res.json({ duplicate: result.duplicate, inboundId: result.inboundId, replies: result.replies.map((x) => ({ id: String(x._id), ...x.payload })), conversation: conv ? snapshot(conv) : null });
});

demoRouter.get('/conversations/:waId', async (req, res) => {
  const waId = z.string().regex(WA_ID).parse(req.params.waId);
  const conv = await Conversation.findOne({ waId }).lean();
  if (!conv) return res.json({ conversation: null, messages: [] });
  const after = typeof req.query.after === 'string' ? new Date(req.query.after) : null;
  const q: Record<string, unknown> = { conversationId: conv._id };
  if (after && !isNaN(after.getTime())) q.createdAt = { $gt: after };
  const msgs = await Message.find(q).sort({ createdAt: 1 }).limit(500).lean();
  res.json({ conversation: snapshot(conv), messages: msgs.map(publicMsg) });
});

demoRouter.post('/reset', async (req, res) => {
  const { waId } = z.object({ waId: z.string().regex(WA_ID) }).parse(req.body);
  const r = await conversationQueue.run(waId, async () => {
    const out = await handleInbound({ waId, messageId: `sim_${crypto.randomUUID()}`, channel: 'simulator', type: 'interactive', interactiveId: 'cmd:reset', text: 'reset' });
    await deliverReplies(waId, 'simulator', out.replies);
    return out;
  });
  res.json({ replies: r.replies.map((x) => ({ id: String(x._id), ...x.payload })) });
});

/** Sample plate images shipped with the repo (for one-click testing in the simulator). */
const platesDir = path.resolve(process.cwd(), 'fixtures/plates');
demoRouter.get('/plates', (_req, res) => {
  let manifest: { images?: Array<{ file: string; expectedSerial: string | null; expected: string }> } = {};
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(platesDir, 'manifest.json'), 'utf8'));
  } catch {
    /* no manifest */
  }
  res.json({ plates: (manifest.images ?? []).map((i) => ({ file: i.file, url: `/demo/plates/${i.file}`, expectedSerial: i.expectedSerial, expected: i.expected })) });
});
