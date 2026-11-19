import { Schema, model, InferSchemaType } from 'mongoose';

const schema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    label: { type: String, required: true },
    labelHi: { type: String, default: '' }, // optional Hindi label (bonus)
    position: { type: String, default: 'hydraulic' },
    imageUrl: { type: String, default: '' },
  },
  { timestamps: true },
);
export type AssemblyDoc = InferSchemaType<typeof schema>;
export const Assembly = model('Assembly', schema);
