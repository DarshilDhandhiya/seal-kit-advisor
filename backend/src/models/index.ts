export * from './Machine.js';
export * from './Assembly.js';
export * from './Kit.js';
export * from './Fitment.js';
export * from './Conversation.js';
export * from './Message.js';
export * from './Lead.js';
export * from './ReviewTicket.js';
export * from './AuditLog.js';
export * from './User.js';

import { Machine } from './Machine.js';
import { Assembly } from './Assembly.js';
import { Kit } from './Kit.js';
import { Fitment } from './Fitment.js';
import { Conversation } from './Conversation.js';
import { Message } from './Message.js';
import { Lead } from './Lead.js';
import { ReviewTicket } from './ReviewTicket.js';
import { AuditLog } from './AuditLog.js';
import { User } from './User.js';

export const allModels = [Machine, Assembly, Kit, Fitment, Conversation, Message, Lead, ReviewTicket, AuditLog, User];

/** Create all declared indexes (unique serial / sku / messageId / fitment compound ...). */
export async function ensureModelIndexes() {
  for (const m of allModels) await m.createIndexes();
}
