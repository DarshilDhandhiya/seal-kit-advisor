import { Schema, model, InferSchemaType } from 'mongoose';

const schema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    waId: { type: String, required: true, index: true },
    direction: { type: String, enum: ['in', 'out'], required: true },
    sender: { type: String, enum: ['customer', 'bot', 'staff', 'system'], default: 'customer' },
    // Idempotency key. Inbound = WhatsApp wamid (or sim_*); outbound = out_<uuid>. UNIQUE.
    messageId: { type: String, required: true, unique: true },
    waMessageId: { type: String, index: true, sparse: true }, // wamid returned by the Cloud API for outbound
    type: { type: String, enum: ['text', 'image', 'interactive', 'unsupported', 'buttons', 'list'], default: 'text' },
    text: { type: String, default: '' },
    interactiveId: { type: String, default: null },
    payload: { type: Schema.Types.Mixed, default: null }, // outbound OutMessage as sent (buttons/list/image)
    media: {
      mediaId: String,
      mime: String,
      size: Number,
      sha256: String, // image hash for audit
      file: String, // encrypted file name on disk (null once deleted)
      expiresAt: Date,
      deletedAt: Date,
      _id: false,
    },
    ocr: {
      provider: String,
      rawText: String,
      confidence: Number,
      candidates: [String],
      outcome: String, // confirm | uncertain | ambiguous | unreadable | error
      durationMs: Number,
      imageHash: String,
      _id: false,
    },
    delivery: {
      status: { type: String, enum: ['pending', 'sent', 'delivered', 'read', 'failed', 'simulated', 'skipped'], default: 'pending' },
      attempts: { type: Number, default: 0 },
      error: String,
      updatedAt: Date,
      _id: false,
    },
    processedAt: { type: Date },
  },
  { timestamps: true },
);
schema.index({ conversationId: 1, createdAt: 1 });
schema.index({ 'media.expiresAt': 1 }, { sparse: true });
export type MessageDoc = InferSchemaType<typeof schema>;
export const Message = model('Message', schema);
