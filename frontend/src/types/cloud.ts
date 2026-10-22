import type { Environment, HealthStatus, Provider } from './common';

export type AccountStatus = 'connected' | 'syncing' | 'error' | 'disconnected';

export interface CloudAccount {
  _id: string;
  provider: Provider;
  accountName: string;
  accountId: string;
  status: AccountStatus;
  regions: string[];
  environment: Environment;
  lastSync?: string;
  lastSyncDurationMs?: number;
  lastError?: string;
  createdAt: string;
  resourceCount: number;
  healthCounts: Record<HealthStatus, number>;
  health: HealthStatus;
  monthlyCost: number;
}

export interface ProviderOverview {
  provider: Provider;
  label: string;
  status: AccountStatus | 'not-connected';
  health: HealthStatus;
  accounts: Array<Pick<CloudAccount, '_id' | 'accountName' | 'accountId' | 'status' | 'environment'>>;
  accountName: string | null;
  regionCount: number;
  resourceCount: number;
  monthlyCost: number;
  lastSync: string | null;
}

export interface ConnectionPayload {
  provider: Provider;
  accountName: string;
  accountId: string;
  environment: Environment;
  credentials: Record<string, string>;
}

export interface ValidationResult {
  ok: boolean;
  message: string;
  regions: string[];
  latencyMs: number;
}

export interface SyncResult {
  discovered: number;
  added: number;
  updated: number;
  removed: number;
  costRecords: number;
  durationMs: number;
}

export interface ServiceHealthItem {
  _id: string;
  name: string;
  category: 'cloud' | 'platform' | 'application' | 'data';
  provider: Provider | 'platform';
  description: string;
  endpoint?: string;
  status: HealthStatus;
  uptime: number;
  responseTime: number;
  errorRate: number;
  lastChecked: string;
  history: Array<{ timestamp: string; status: HealthStatus; responseTime: number }>;
}

export interface ServiceHealthResponse {
  summary: Record<HealthStatus, number> & { total: number; overall: HealthStatus };
  services: ServiceHealthItem[];
}
