import { Schema, model, InferSchemaType } from 'mongoose';

const schema = new Schema(
  {
    serial: { type: String, required: true, unique: true, uppercase: true, trim: true },
    model: { type: String, required: true, trim: true },
    family: { type: String, required: true, uppercase: true, trim: true },
    variant: { type: String, required: true, trim: true },
    year: { type: Number, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);
export type MachineDoc = InferSchemaType<typeof schema>;
export const Machine = model('Machine', schema);
