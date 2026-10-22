import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';
import { ENVIRONMENTS, HEALTH_STATUSES, PROVIDERS, RESOURCE_TYPES } from './types';

export const RESOURCE_STATES = ['running', 'stopped', 'provisioning'] as const;

const resourceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    resourceId: { type: String, required: true, unique: true },
    provider: { type: String, enum: PROVIDERS, required: true },
    cloudAccountId: { type: Schema.Types.ObjectId, ref: 'CloudAccount', required: true, index: true },
    type: { type: String, enum: RESOURCE_TYPES, required: true, index: true },
    /** Provider-native service name, e.g. "EC2", "Azure SQL Database", "GKE". */
    service: { type: String, required: true },
    /** Provider-native SKU / size, e.g. "m6i.xlarge". */
    sku: { type: String },
    region: { type: String, required: true },
    environment: { type: String, enum: ENVIRONMENTS, default: 'production', index: true },
    status: { type: String, enum: HEALTH_STATUSES, default: 'healthy' },
    state: { type: String, enum: RESOURCE_STATES, default: 'running' },
    cpu: { type: Number, default: 0, min: 0, max: 100 },
    memory: { type: Number, default: 0, min: 0, max: 100 },
    /** Current throughput in Mbps (in + out). */
    network: { type: Number, default: 0, min: 0 },
    networkCapacity: { type: Number, default: 1000 },
    storage: {
      usedGB: { type: Number, default: 0 },
      totalGB: { type: Number, default: 0 },
    },
    /** Monthly run-rate cost in USD. */
    cost: { type: Number, default: 0, min: 0 },
    tags: { type: Map, of: String, default: {} },
    /** Simulation baselines – used by the mock provider to keep metrics realistic. */
    baseline: {
      cpu: { type: Number, default: 30 },
      memory: { type: Number, default: 45 },
      network: { type: Number, default: 50 },
    },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

resourceSchema.index({ provider: 1 });
resourceSchema.index({ status: 1 });
resourceSchema.index({ region: 1 });
resourceSchema.index({ name: 'text', resourceId: 'text', service: 'text' });
resourceSchema.index({ provider: 1, status: 1, type: 1 });

resourceSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.baseline;
    delete ret.__v;
    return ret;
  },
});

export type IResource = InferSchemaType<typeof resourceSchema>;
export type ResourceDocument = HydratedDocument<IResource>;
export const Resource = model('Resource', resourceSchema);
