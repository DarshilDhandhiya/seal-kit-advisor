import express, { Router } from 'express';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { conversationQueue } from '../lib/queue.js';
import { Message } from '../models/index.js';
import { handleInbound } from '../services/bot.js';
import { applyStatus, deliverReplies } from '../services/delivery.js';
import { downloadMedia, MediaError, parseWebhook, verifySignature, type ParsedMessage } from '../services/whatsappClient.js';

export const webhookRouter = Router();

/** GET: Meta webhook verification handshake. */
webhookRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && config.WHATSAPP_VERIFY_TOKEN && token === config.WHATSAPP_VERIFY_TOKEN && typeof challenge === 'string') {
    return res.status(200).type('text/plain').send(challenge);
  }
  res.sendStatus(403);
});

const inflight = new Set<Promise<unknown>>();
/** Wait for all background webhook processing (used by tests and graceful shutdown). */
export const drainWebhookQueue = async () => {
  while (inflight.size) await Promise.allSettled([...inflight]);
};

export async function processWhatsAppMessage(m: ParsedMessage) {
  // Cheap duplicate check BEFORE downloading media (the unique index on messageId is the real guarantee).
  if (await Message.exists({ messageId: m.messageId })) {
    logger.info({ messageId: m.messageId }, 'duplicate webhook delivery skipped');
    return;
  }
  let image: { buffer: Buffer; mediaId?: string } | undefined;
  let imageError: 'too_large' | 'bad_type' | 'download_failed' | undefined;
  if (m.type === 'image') {
    if (!m.mediaId) imageError = 'download_failed';
    else {
      try {
        const d = await downloadMedia(m.mediaId);
        image = { buffer: d.buffer, mediaId: m.mediaId };
      } catch (e) {
        imageError = e instanceof MediaError ? e.reason : 'download_failed';
        logger.warn({ err: String(e), mediaId: m.mediaId }, 'inbound media rejected');
      }
    }
  }
  const result = await handleInbound({
    waId: m.waId,
    messageId: m.messageId,
    channel: 'whatsapp',
    type: m.type,
    text: m.text,
    interactiveId: m.interactiveId,
    profileName: m.profileName,
    image,
    imageError,
  });
  if (!result.duplicate) await deliverReplies(m.waId, 'whatsapp', result.replies);
}

/** Process a parsed webhook body. Messages from one user are serialised; slow OCR never blocks the HTTP ack. */
export function enqueueWebhook(body: unknown): Promise<void> {
  const { messages, statuses } = parseWebhook(body);
  const job = (async () => {
    for (const s of statuses) await applyStatus(s).catch((e) => logger.error({ err: e }, 'status update failed'));
    await Promise.allSettled(
      messages.map((m) => conversationQueue.run(m.waId, () => processWhatsAppMessage(m)).catch((e) => logger.error({ err: e, messageId: m.messageId }, 'webhook message failed'))),
    );
  })();
  inflight.add(job);
  job.finally(() => inflight.delete(job));
  return job;
}

/** POST: events. Must receive the RAW body so the HMAC signature can be verified. */
webhookRouter.post('/', express.raw({ type: '*/*', limit: '2mb' }), (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (config.WHATSAPP_APP_SECRET) {
    if (!verifySignature(raw, req.header('x-hub-signature-256'), config.WHATSAPP_APP_SECRET)) {
      logger.warn('webhook signature mismatch');
      return res.status(401).json({ error: { code: 'BAD_SIGNATURE', message: 'Invalid signature' } });
    }
  } else if (!config.ALLOW_UNSIGNED_WEBHOOKS) {
    return res.status(401).json({ error: { code: 'NO_APP_SECRET', message: 'WHATSAPP_APP_SECRET is not configured; refusing unsigned webhook' } });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON' } });
  }
  res.sendStatus(200); // acknowledge immediately; do the work in the background
  enqueueWebhook(body).catch((e) => logger.error({ err: e }, 'webhook job failed'));
});
