import { Schema, model } from 'mongoose';

const schema = new Schema(
  {
    entity: { type: String, required: true, index: true }, // kit | fitment | machine | ticket | lead | conversation
    entityId: { type: String, required: true, index: true },
    action: { type: String, enum: ['create', 'update', 'delete'], required: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    actor: { type: String, required: true },
    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);
export const AuditLog = model('AuditLog', schema);
