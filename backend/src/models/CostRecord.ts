import { Schema, model, InferSchemaType } from 'mongoose';
import { PROVIDERS } from './types';

const costRecordSchema = new Schema(
  {
    provider: { type: String, enum: PROVIDERS, required: true },
    cloudAccountId: { type: Schema.Types.ObjectId, ref: 'CloudAccount' },
    service: { type: String, required: true },
    region: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    /** UTC midnight of the billing day. */
    date: { type: Date, required: true },
    resourceId: { type: String },
  },
  { versionKey: false },
);

costRecordSchema.index({ provider: 1 });
costRecordSchema.index({ service: 1 });
costRecordSchema.index({ date: -1 });
costRecordSchema.index({ provider: 1, service: 1, date: -1 });

export type ICostRecord = InferSchemaType<typeof costRecordSchema>;
export const CostRecord = model('CostRecord', costRecordSchema);
