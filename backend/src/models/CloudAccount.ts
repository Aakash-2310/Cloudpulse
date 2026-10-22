import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';
import { PROVIDERS } from './types';

export const ACCOUNT_STATUSES = ['connected', 'syncing', 'error', 'disconnected'] as const;

const cloudAccountSchema = new Schema(
  {
    provider: { type: String, enum: PROVIDERS, required: true, index: true },
    accountName: { type: String, required: true, trim: true, maxlength: 80 },
    accountId: { type: String, required: true, trim: true },
    status: { type: String, enum: ACCOUNT_STATUSES, default: 'connected', index: true },
    regions: { type: [String], default: [] },
    environment: { type: String, default: 'production' },
    lastSync: { type: Date },
    lastSyncDurationMs: { type: Number },
    lastError: { type: String },
    // Non-secret connection metadata only (e.g. role ARN alias, tenant name).
    // Secrets are never stored in plain text; real integrations should use a secrets manager reference here.
    credentialRef: { type: String, select: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

cloudAccountSchema.index({ provider: 1, accountId: 1 }, { unique: true });

cloudAccountSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.credentialRef;
    delete ret.__v;
    return ret;
  },
});

export type ICloudAccount = InferSchemaType<typeof cloudAccountSchema>;
export type CloudAccountDocument = HydratedDocument<ICloudAccount>;
export const CloudAccount = model('CloudAccount', cloudAccountSchema);
