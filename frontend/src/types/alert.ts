import type { Provider, Severity } from './common';

export type AlertStatus = 'open' | 'acknowledged' | 'resolved';
export type AlertType =
  | 'high-cpu'
  | 'high-memory'
  | 'high-network'
  | 'storage-capacity'
  | 'service-down'
  | 'cost-spike'
  | 'resource-failure'
  | 'resource-created';

export interface Alert {
  _id: string;
  title: string;
  description: string;
  type: AlertType;
  resourceId?: string;
  resourceName?: string;
  provider: Provider | 'platform';
  severity: Severity;
  status: AlertStatus;
  rule?: string;
  ruleName?: string;
  metricValue?: number;
  threshold?: number;
  acknowledgedAt?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertCounts {
  open: number;
  acknowledged: number;
  resolved: number;
  critical: number;
  warning: number;
  info: number;
  active: number;
}

export type RuleMetric = 'cpu' | 'memory' | 'disk' | 'network' | 'error-rate' | 'cost-increase' | 'service-availability';
export type RuleOperator = '>' | '>=' | '<' | '<=' | '==';

export interface AlertRule {
  _id: string;
  name: string;
  description: string;
  metric: RuleMetric;
  operator: RuleOperator;
  threshold: number;
  duration: number;
  severity: Severity;
  enabled: boolean;
  lastTriggeredAt?: string;
  triggerCount: number;
  createdAt: string;
}

export type AlertRulePayload = Omit<AlertRule, '_id' | 'lastTriggeredAt' | 'triggerCount' | 'createdAt'>;

export interface Notification {
  _id: string;
  type: 'alert' | 'alert-resolved' | 'connection-failure' | 'cost-anomaly' | 'system';
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info' | 'success';
  link?: string;
  createdAt: string;
  read: boolean;
}
