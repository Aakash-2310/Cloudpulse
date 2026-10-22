import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';
import { PROVIDERS, SEVERITIES } from './types';

export const ALERT_STATUSES = ['open', 'acknowledged', 'resolved'] as const;
export const ALERT_TYPES = [
  'high-cpu',
  'high-memory',
  'high-network',
  'storage-capacity',
  'service-down',
  'cost-spike',
  'resource-failure',
  'resource-created',
] as const;

const alertSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    type: { type: String, enum: ALERT_TYPES, default: 'resource-failure' },
    resourceId: { type: String },
    resourceName: { type: String },
    provider: { type: String, enum: [...PROVIDERS, 'platform'], default: 'platform' },
    severity: { type: String, enum: SEVERITIES, required: true },
    status: { type: String, enum: ALERT_STATUSES, default: 'open' },
    rule: { type: Schema.Types.ObjectId, ref: 'AlertRule' },
    ruleName: { type: String },
    metricValue: { type: Number },
    threshold: { type: Number },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: { type: Date },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

alertSchema.index({ status: 1 });
alertSchema.index({ severity: 1 });
alertSchema.index({ createdAt: -1 });
alertSchema.index({ resourceId: 1, rule: 1, status: 1 });

export type IAlert = InferSchemaType<typeof alertSchema>;
export type AlertDocument = HydratedDocument<IAlert>;
export const Alert = model('Alert', alertSchema);
