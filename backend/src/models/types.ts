export const PROVIDERS = ['aws', 'azure', 'gcp'] as const;
export type Provider = (typeof PROVIDERS)[number];

export const HEALTH_STATUSES = ['healthy', 'warning', 'critical', 'unknown'] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const SEVERITIES = ['critical', 'warning', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const ENVIRONMENTS = ['production', 'staging', 'development'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const RESOURCE_TYPES = [
  'virtual-machine',
  'kubernetes-cluster',
  'database',
  'object-storage',
  'load-balancer',
  'virtual-network',
  'container',
  'serverless-function',
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

/** Resource types counted as "compute" on the compute monitoring page. */
export const COMPUTE_TYPES: ResourceType[] = ['virtual-machine', 'kubernetes-cluster', 'container', 'serverless-function'];

export const PROVIDER_LABELS: Record<Provider, string> = {
  aws: 'AWS',
  azure: 'Azure',
  gcp: 'GCP',
};
