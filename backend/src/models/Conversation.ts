import { Schema, model, InferSchemaType } from 'mongoose';

export const CONVERSATION_STATES = [
  'awaiting_image',
  'awaiting_serial_confirmation',
  'awaiting_assembly',
  'recommendation',
  'awaiting_lead',
  'human_review',
  'closed',
] as const;
export type ConversationState = (typeof CONVERSATION_STATES)[number];

const schema = new Schema(
  {
    waId: { type: String, required: true, unique: true, index: true },
    channel: { type: String, enum: ['whatsapp', 'simulator'], default: 'whatsapp' },
    profileName: { type: String, default: '' },
    state: { type: String, enum: CONVERSATION_STATES, default: 'awaiting_image', index: true },
    language: { type: String, enum: ['en', 'hi'], default: 'en' },
    confirmedSerial: { type: String, default: null },
    candidateSerial: { type: String, default: null },
    candidateSerials: { type: [String], default: [] },
    assemblyCode: { type: String, default: null },
    suggestedSku: { type: String, default: null },
    // Free-form working data: failedReads, leadStep, leadDraft, lastAckAt ...
    context: { type: Schema.Types.Mixed, default: {} },
    stateHistory: {
      type: [{ state: String, reason: String, at: { type: Date, default: Date.now }, _id: false }],
      default: [],
    },
    lastInboundAt: { type: Date },
    lastOutboundAt: { type: Date },
  },
  { timestamps: true },
);
export type ConversationDoc = InferSchemaType<typeof schema>;
export const Conversation = model('Conversation', schema);
