import { Schema, model, InferSchemaType } from 'mongoose';

const schema = new Schema(
  {
    ref: { type: String, required: true, unique: true },
    customerName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    consent: { type: Boolean, required: true },
    consentAt: { type: Date },
    suggestedSku: { type: String, default: null },
    machineSerial: { type: String, default: null },
    assemblyCode: { type: String, default: null },
    status: { type: String, enum: ['new', 'contacted', 'quoted', 'won', 'lost'], default: 'new', index: true },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);
export type LeadDoc = InferSchemaType<typeof schema>;
export const Lead = model('Lead', schema);
