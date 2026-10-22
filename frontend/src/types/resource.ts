import type { Environment, HealthStatus, Provider } from './common';

export type ResourceType =
  | 'virtual-machine'
  | 'kubernetes-cluster'
  | 'database'
  | 'object-storage'
  | 'load-balancer'
  | 'virtual-network'
  | 'container'
  | 'serverless-function';

export interface Resource {
  _id: string;
  name: string;
  resourceId: string;
  provider: Provider;
  cloudAccountId: { _id: string; accountName: string; accountId?: string; provider: Provider; environment?: string } | string;
  type: ResourceType;
  service: string;
  sku?: string;
  region: string;
  environment: Environment;
  status: HealthStatus;
  state: 'running' | 'stopped' | 'provisioning';
  cpu: number;
  memory: number;
  network: number;
  networkCapacity: number;
  storage: { usedGB: number; totalGB: number };
  cost: number;
  tags: Record<string, string>;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceFacets {
  regions: string[];
  services: string[];
  providers: Provider[];
  types: ResourceType[];
  statuses: HealthStatus[];
  environments: Environment[];
}

export interface ResourceQuery {
  page?: number;
  limit?: number;
  search?: string;
  provider?: string;
  status?: string;
  type?: string;
  region?: string;
  environment?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}
