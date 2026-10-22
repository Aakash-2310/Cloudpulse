import { Schema, model, InferSchemaType } from 'mongoose';

const metricSchema = new Schema(
  {
    /** References Resource.resourceId (provider-native id), not the Mongo _id. */
    resourceId: { type: String, required: true },
    timestamp: { type: Date, required: true },
    cpu: { type: Number, default: 0 },
    memory: { type: Number, default: 0 },
    networkIn: { type: Number, default: 0 },
    networkOut: { type: Number, default: 0 },
    diskUsage: { type: Number, default: 0 },
    requestCount: { type: Number, default: 0 },
    errorRate: { type: Number, default: 0 },
  },
  { versionKey: false },
);

metricSchema.index({ resourceId: 1, timestamp: -1 });
metricSchema.index({ timestamp: -1 });
// Keep 35 days of raw metrics; MongoDB removes older documents automatically.
metricSchema.index({ timestamp: 1 }, { expireAfterSeconds: 35 * 24 * 60 * 60, name: 'metric_ttl' });

export type IMetric = InferSchemaType<typeof metricSchema>;
export const Metric = model('Metric', metricSchema);
