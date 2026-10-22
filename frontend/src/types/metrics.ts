import type { HealthStatus, Provider, TimeRange } from './common';
import type { Alert } from './alert';
import type { ResourceType } from './resource';

export interface HealthScore {
  score: number;
  grade: 'excellent' | 'good' | 'fair' | 'poor';
  components: { resources: number; services: number; criticalAlertPenalty: number };
}

export interface ProviderHealth {
  provider: Provider;
  label: string;
  status: HealthStatus;
  resources: number;
  healthy: number;
  warning: number;
  critical: number;
  unknown: number;
  accounts: number;
  regions: number;
  cost: number;
  lastSync: string | null;
}

export interface DashboardSummary {
  kpis: {
    cloudProviders: number;
    cloudAccounts: number;
    totalResources: number;
    healthy: number;
    warning: number;
    critical: number;
    unknown: number;
    monthlyCost: number;
    monthlyCostChangePct: number;
    activeAlerts: number;
    criticalAlerts: number;
  };
  healthScore: HealthScore;
  providers: ProviderHealth[];
  recentAlerts: Alert[];
  generatedAt: string;
}

export interface TimelinePoint {
  timestamp: string;
  cpu: number;
  memory: number;
  networkIn: number;
  networkOut: number;
  requests: number;
  errors: number;
  errorRate: number;
  disk: number;
  resources: number;
}

export interface CostBreakdownItem {
  name: string;
  label: string;
  provider?: Provider;
  amount: number;
  share: number;
  previous: number;
  changePct: number | null;
}

export interface DailyCostPoint {
  date: string;
  aws: number;
  azure: number;
  gcp: number;
  total: number;
}

export interface DashboardMetrics {
  range: TimeRange;
  binMinutes: number;
  timeline: TimelinePoint[];
  costByProvider: CostBreakdownItem[];
  dailyCost: DailyCostPoint[];
}

export interface ResourceBrief {
  _id: string;
  name: string;
  provider: Provider;
  type: ResourceType;
  cpu: number;
  memory: number;
  cost: number;
  storageUtilization: number;
}

export interface Insight {
  id: string;
  category: 'cost' | 'performance' | 'capacity' | 'reliability';
  severity: 'info' | 'warning' | 'critical' | 'success';
  message: string;
  link?: string;
}

export interface InsightsResponse {
  healthScore: HealthScore;
  insights: Insight[];
  utilization: { underutilized: ResourceBrief[]; overutilized: ResourceBrief[]; idle: ResourceBrief[] };
  recommendations: Array<{ resource: ResourceBrief; action: string; detail: string; estimatedSavings: number }>;
  potentialSavings: number;
}

export interface ResourceMetricPoint {
  timestamp: string;
  cpu: number;
  memory: number;
  networkIn: number;
  networkOut: number;
  diskUsage: number;
  requestCount: number;
  errorRate: number;
}

export interface MetricStat {
  avg: number;
  max: number;
  min: number;
}

export interface ResourceMetrics {
  range: TimeRange;
  binMinutes: number;
  points: ResourceMetricPoint[];
  summary: Record<'cpu' | 'memory' | 'networkIn' | 'networkOut' | 'diskUsage' | 'requestCount' | 'errorRate', MetricStat>;
}

export interface ComputeOverview {
  range: TimeRange;
  totals: {
    instances: number;
    running: number;
    stopped: number;
    avgCpu: number;
    avgMemory: number;
    healthy: number;
    warning: number;
    critical: number;
  };
  statusDistribution: Array<{ status: HealthStatus; count: number }>;
  stateDistribution: Array<{ state: string; count: number }>;
  byProvider: Array<{ provider: Provider; label: string; total: number; running: number; avgCpu: number }>;
  byType: Array<{ type: ResourceType; count: number }>;
  timeline: Array<{ timestamp: string; cpu: number; memory: number }>;
  topConsumers: Array<{ _id: string; name: string; provider: Provider; type: ResourceType; sku?: string; region: string; cpu: number; memory: number; status: HealthStatus; cost: number }>;
  underutilized: Array<{ _id: string; name: string; provider: Provider; cpu: number; cost: number }>;
}

export interface StorageOverview {
  totals: {
    totalTB: number;
    usedTB: number;
    freeTB: number;
    utilization: number;
    growth30dTB: number;
    growth30dPct: number;
    monthToDateCost: number;
    costChangePct: number;
    nearCapacity: number;
  };
  growth: Array<{ date: string; usedTB: number }>;
  byProvider: Array<{ provider: Provider; label: string; totalTB: number; usedTB: number; utilization: number }>;
  costTrend: DailyCostPoint[];
  volumes: Array<{ _id: string; name: string; provider: Provider; type: ResourceType; service: string; region: string; usedGB: number; totalGB: number; utilization: number; status: HealthStatus }>;
}

export interface NetworkOverview {
  range: TimeRange;
  totals: {
    incomingMbps: number;
    outgoingMbps: number;
    bandwidthUtilization: number;
    totalCapacityGbps: number;
    requestsPerMin: number;
    errorsPerMin: number;
    errorRate: number;
    avgIncomingMbps: number;
    avgOutgoingMbps: number;
  };
  timeline: Array<{ timestamp: string; networkIn: number; networkOut: number; requests: number; errors: number; errorRate: number; bandwidth: number }>;
  byProvider: Array<{ provider: Provider; label: string; throughputMbps: number; resources: number }>;
  topTalkers: Array<{ _id: string; name: string; provider: Provider; type: ResourceType; region: string; throughputMbps: number; utilization: number; status: HealthStatus }>;
}
