import { Schema, model, InferSchemaType } from 'mongoose';

const schema = new Schema(
  {
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true },
    assemblyCode: { type: String, required: true, uppercase: true, index: true },
    demoPriceINR: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    imageUrl: { type: String, default: '' },
    description: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export type KitDoc = InferSchemaType<typeof schema>;
export const Kit = model('Kit', schema);
