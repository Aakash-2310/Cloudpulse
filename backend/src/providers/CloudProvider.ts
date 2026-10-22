import type { Environment, HealthStatus, Provider, ResourceType } from '../models/types';

/**
 * Provider abstraction. Every cloud integration (mock, AWS, Azure, GCP) implements this
 * interface, so the service layer and the frontend never depend on a specific vendor SDK.
 */

export interface ConnectionInput {
  provider: Provider;
  accountName: string;
  accountId: string;
  environment: Environment;
  /** Credentials are only ever passed server-side and are never persisted in plain text. */
  credentials: Record<string, string>;
}

export interface ConnectionResult {
  ok: boolean;
  message: string;
  regions: string[];
  latencyMs: number;
}

export interface AccountRef {
  id: string;
  provider: Provider;
  accountId: string;
  accountName: string;
  environment: string;
  regions: string[];
}

export interface DiscoveredResource {
  name: string;
  resourceId: string;
  provider: Provider;
  type: ResourceType;
  service: string;
  sku: string;
  region: string;
  environment: Environment;
  state: 'running' | 'stopped' | 'provisioning';
  cpu: number;
  memory: number;
  network: number;
  networkCapacity: number;
  storage: { usedGB: number; totalGB: number };
  cost: number;
  tags: Record<string, string>;
  baseline: { cpu: number; memory: number; network: number };
  createdAt: Date;
}

/** Minimal view of a resource needed to produce metrics. */
export interface MetricContext {
  resourceId: string;
  type: ResourceType;
  state: string;
  cpu: number;
  memory: number;
  network: number;
  storage: { usedGB: number; totalGB: number };
  baseline: { cpu: number; memory: number; network: number };
}

export interface MetricSample {
  resourceId: string;
  timestamp: Date;
  cpu: number;
  memory: number;
  networkIn: number;
  networkOut: number;
  diskUsage: number;
  requestCount: number;
  errorRate: number;
}

export interface DailyCost {
  provider: Provider;
  service: string;
  region: string;
  amount: number;
  currency: string;
  date: Date;
}

export interface ServiceHealthSample {
  name: string;
  category: 'cloud' | 'platform' | 'application' | 'data';
  provider: Provider | 'platform';
  description: string;
  endpoint?: string;
  status: HealthStatus;
  responseTime: number;
  errorRate: number;
}

export interface CloudProvider {
  readonly id: string;
  validateConnection(input: ConnectionInput): Promise<ConnectionResult>;
  getResources(account: AccountRef): Promise<DiscoveredResource[]>;
  getMetrics(resource: MetricContext, from: Date, to: Date, stepMinutes: number): Promise<MetricSample[]>;
  /** Returns the most recent metric sample (used by the polling/monitoring loop). */
  getCurrentMetrics(resource: MetricContext): Promise<MetricSample>;
  getCosts(account: AccountRef, from: Date, to: Date): Promise<DailyCost[]>;
  getServiceHealth(): Promise<ServiceHealthSample[]>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(
      `${provider} live integration is not configured. Set CLOUD_PROVIDER_MODE=mock, or install the ${provider} SDK and implement the provider adapter.`,
    );
    this.name = 'ProviderNotConfiguredError';
  }
}
