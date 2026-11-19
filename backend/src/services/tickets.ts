import crypto from 'node:crypto';
import { ReviewTicket, type TicketReason } from '../models/index.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeRef(prefix: string): string {
  const bytes = crypto.randomBytes(6);
  return `${prefix}-${[...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')}`;
}

export interface TicketInput {
  conversationId: unknown;
  waId: string;
  reason: TicketReason;
  detail?: string;
  machineSerial?: string | null;
  assemblyCode?: string | null;
  suggestedSku?: string | null;
}

/** Creates a staff review ticket (or returns the already-open identical one so we never spam staff). */
export async function createTicket(input: TicketInput): Promise<{ ref: string; _id: unknown }> {
  const existing = await ReviewTicket.findOne({
    conversationId: input.conversationId,
    reason: input.reason,
    machineSerial: input.machineSerial ?? null,
    assemblyCode: input.assemblyCode ?? null,
    status: { $in: ['open', 'in_progress'] },
  } as any);
  if (existing) return existing;
  return ReviewTicket.create({
    ref: makeRef('TKT'),
    conversationId: input.conversationId as any,
    waId: input.waId,
    reason: input.reason,
    detail: input.detail ?? '',
    machineSerial: input.machineSerial ?? null,
    assemblyCode: input.assemblyCode ?? null,
    suggestedSku: input.suggestedSku ?? null,
  });
}
