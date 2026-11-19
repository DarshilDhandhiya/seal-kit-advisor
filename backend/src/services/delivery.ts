import { config } from '../config.js';
import { logger } from '../logger.js';
import { Conversation, Message } from '../models/index.js';
import type { OutMessage } from '../types.js';
import { sendMessage } from './whatsappClient.js';

export interface Deliverable {
  _id: unknown;
  payload: OutMessage;
}

const RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3 };

/** Deliver already-persisted outbound messages over the conversation's channel and log delivery status. */
export async function deliverReplies(waId: string, channel: string, replies: Deliverable[]) {
  for (const r of replies) {
    if (channel === 'simulator') {
      await Message.updateOne({ _id: r._id }, { $set: { 'delivery.status': 'simulated', 'delivery.updatedAt': new Date() } });
      continue;
    }
    if (!config.whatsappConfigured) {
      await Message.updateOne({ _id: r._id }, { $set: { 'delivery.status': 'skipped', 'delivery.error': 'WhatsApp credentials not configured', 'delivery.updatedAt': new Date() } });
      continue;
    }
    const res = await sendMessage(waId, r.payload);
    await Message.updateOne(
      { _id: r._id },
      {
        $set: {
          'delivery.status': res.ok ? 'sent' : 'failed',
          'delivery.attempts': res.attempts,
          'delivery.error': res.ok ? undefined : res.error,
          'delivery.updatedAt': new Date(),
          ...(res.wamid ? { waMessageId: res.wamid } : {}),
        },
      },
    );
    if (!res.ok) logger.error({ waId, error: res.error }, 'outbound message failed after retries');
  }
}

/** Apply a WhatsApp status webhook (sent / delivered / read / failed) to the matching outbound message. */
export async function applyStatus(s: { id: string; status: string; errors?: Array<{ title?: string; message?: string; code?: number }> }) {
  const m = await Message.findOne({ waMessageId: s.id });
  if (!m) return false;
  const current = m.delivery?.status ?? 'pending';
  if (s.status === 'failed') {
    m.set('delivery.status', 'failed');
    m.set('delivery.error', s.errors?.map((e) => `${e.code ?? ''} ${e.title ?? e.message ?? ''}`.trim()).join('; ') || 'failed');
  } else if (s.status in RANK && (RANK[s.status] ?? 0) >= (RANK[current] ?? 0)) {
    m.set('delivery.status', s.status);
  } else return true; // out-of-order status ignored
  m.set('delivery.updatedAt', new Date());
  await m.save();
  return true;
}

/** Staff message typed in the admin console (delivered over the same channel). */
export async function sendStaffMessage(conversationId: string, text: string, actor: string) {
  const conv = await Conversation.findById(conversationId);
  if (!conv) return null;
  const crypto = await import('node:crypto');
  const doc = await Message.create({
    conversationId: conv._id,
    waId: conv.waId,
    direction: 'out',
    sender: 'staff',
    messageId: `out_${crypto.randomUUID()}`,
    type: 'text',
    text,
    payload: { kind: 'text', text } satisfies OutMessage,
    delivery: { status: 'pending', attempts: 0 },
  });
  conv.lastOutboundAt = new Date();
  await conv.save();
  await deliverReplies(conv.waId, conv.channel, [{ _id: doc._id, payload: { kind: 'text', text } }]);
  logger.info({ actor, conversationId }, 'staff message sent');
  return Message.findById(doc._id).lean();
}
