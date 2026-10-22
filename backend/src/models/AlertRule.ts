import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';
import { SEVERITIES } from './types';

export const RULE_METRICS = ['cpu', 'memory', 'disk', 'network', 'error-rate', 'cost-increase', 'service-availability'] as const;
export type RuleMetric = (typeof RULE_METRICS)[number];
export const RULE_OPERATORS = ['>', '>=', '<', '<=', '=='] as const;
export type RuleOperator = (typeof RULE_OPERATORS)[number];

const alertRuleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    metric: { type: String, enum: RULE_METRICS, required: true },
    operator: { type: String, enum: RULE_OPERATORS, default: '>' },
    threshold: { type: Number, required: true },
    /** Duration in minutes the condition must hold before alerting. */
    duration: { type: Number, default: 5, min: 0, max: 1440 },
    severity: { type: String, enum: SEVERITIES, default: 'warning' },
    enabled: { type: Boolean, default: true, index: true },
    lastTriggeredAt: { type: Date },
    triggerCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export type IAlertRule = InferSchemaType<typeof alertRuleSchema>;
export type AlertRuleDocument = HydratedDocument<IAlertRule>;
export const AlertRule = model('AlertRule', alertRuleSchema);

export function compare(value: number, operator: RuleOperator, threshold: number): boolean {
  switch (operator) {
    case '>':
      return value > threshold;
    case '>=':
      return value >= threshold;
    case '<':
      return value < threshold;
    case '<=':
      return value <= threshold;
    case '==':
      return value === threshold;
    default:
      return false;
  }
}
