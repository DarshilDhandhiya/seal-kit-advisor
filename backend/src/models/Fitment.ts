import { Schema, model, InferSchemaType } from 'mongoose';

const schema = new Schema(
  {
    machineSerial: { type: String, required: true, uppercase: true, trim: true, index: true },
    assemblyCode: { type: String, required: true, uppercase: true, trim: true },
    kitSku: { type: String, required: true, uppercase: true, trim: true },
    evidenceSource: { type: String, default: '' },
    verified: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
// One record per exact serial + assembly + kit. (Two different kits on the same serial+assembly is allowed
// but is treated as "multiple kits" => staff review.)
schema.index({ machineSerial: 1, assemblyCode: 1, kitSku: 1 }, { unique: true });
export type FitmentDoc = InferSchemaType<typeof schema>;
export const Fitment = model('Fitment', schema);
