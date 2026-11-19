import { Schema, model, InferSchemaType } from 'mongoose';

export const TICKET_REASONS = [
  'unknown_serial',
  'no_fitment',
  'multiple_kits',
  'inactive_kit',
  'unknown_assembly',
  'no_stock',
  'ambiguous_ocr',
  'unreadable_photo',
  'customer_requested',
] as const;
export type TicketReason = (typeof TICKET_REASONS)[number];

const schema = new Schema(
  {
    ref: { type: String, required: true, unique: true },
    reason: { type: String, enum: TICKET_REASONS, required: true, index: true },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open', index: true },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', index: true },
    waId: { type: String, index: true },
    suggestedSku: { type: String, default: null },
    machineSerial: { type: String, default: null },
    assemblyCode: { type: String, default: null },
    detail: { type: String, default: '' },
    assignedTo: { type: String, default: '' },
    notes: { type: String, default: '' },
    resolution: { type: String, default: '' },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);
export type TicketDoc = InferSchemaType<typeof schema>;
export const ReviewTicket = model('ReviewTicket', schema);
