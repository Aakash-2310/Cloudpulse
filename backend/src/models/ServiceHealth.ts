import { Schema, model, InferSchemaType } from 'mongoose';
import { HEALTH_STATUSES } from './types';

const serviceHealthSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    category: { type: String, enum: ['cloud', 'platform', 'application', 'data'], default: 'application' },
    provider: { type: String, enum: ['aws', 'azure', 'gcp', 'platform'], default: 'platform' },
    description: { type: String, default: '' },
    endpoint: { type: String },
    status: { type: String, enum: HEALTH_STATUSES, default: 'unknown', index: true },
    uptime: { type: Number, default: 100 },
    responseTime: { type: Number, default: 0 },
    errorRate: { type: Number, default: 0 },
    baselineResponseTime: { type: Number, default: 120 },
    lastChecked: { type: Date, default: Date.now },
    /** Rolling list of recent checks used for the uptime sparkline. */
    history: {
      type: [
        {
          _id: false,
          timestamp: Date,
          status: { type: String, enum: HEALTH_STATUSES },
          responseTime: Number,
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

serviceHealthSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.baselineResponseTime;
    delete ret.__v;
    return ret;
  },
});

export type IServiceHealth = InferSchemaType<typeof serviceHealthSchema>;
export const ServiceHealth = model('ServiceHealth', serviceHealthSchema);
