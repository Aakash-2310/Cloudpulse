import type { HealthStatus, Provider, Severity, TimeRange } from '../types/common';
import type { ResourceType } from '../types/resource';
import type { UserRole } from '../types/auth';

export const APP_NAME = 'CloudPulse';
export const TAGLINE = 'Unified visibility across your entire cloud infrastructure.';

/**
 * Provider series colours: slots 1–3 of the validated categorical palette
 * (validated all-pairs for CVD in both themes). Defined as CSS variables in index.css.
 */
export const PROVIDERS: Record<Provider, { label: string; name: string; color: string }> = {
  aws: { label: 'AWS', name: 'Amazon Web Services', color: 'var(--series-aws)' },
  azure: { label: 'Azure', name: 'Microsoft Azure', color: 'var(--series-azure)' },
  gcp: { label: 'GCP', name: 'Google Cloud Platform', color: 'var(--series-gcp)' },
};
export const PROVIDER_KEYS: Provider[] = ['aws', 'azure', 'gcp'];
export const PROVIDER_FILTER = [{ value: 'all', label: 'All' }, ...PROVIDER_KEYS.map((p) => ({ value: p, label: PROVIDERS[p].label }))];

export const STATUS_META: Record<HealthStatus, { label: string; color: string }> = {
  healthy: { label: 'Healthy', color: 'var(--status-healthy)' },
  warning: { label: 'Warning', color: 'var(--status-warning)' },
  critical: { label: 'Critical', color: 'var(--status-critical)' },
  unknown: { label: 'Unknown', color: 'var(--status-unknown)' },
};

export const SEVERITY_META: Record<Severity, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'var(--status-critical)' },
  warning: { label: 'Warning', color: 'var(--status-warning)' },
  info: { label: 'Info', color: 'var(--status-info)' },
};

export const RESOURCE_TYPES: Record<ResourceType, { label: string; short: string }> = {
  'virtual-machine': { label: 'Virtual Machine', short: 'VM' },
  'kubernetes-cluster': { label: 'Kubernetes Cluster', short: 'K8s' },
  database: { label: 'Database', short: 'DB' },
  'object-storage': { label: 'Object Storage', short: 'Storage' },
  'load-balancer': { label: 'Load Balancer', short: 'LB' },
  'virtual-network': { label: 'Virtual Network', short: 'VNet' },
  container: { label: 'Container', short: 'Container' },
  'serverless-function': { label: 'Serverless Function', short: 'Function' },
};

export const TIME_RANGES: Array<{ value: TimeRange; label: string; short: string }> = [
  { value: '1h', label: 'Last 1 hour', short: '1H' },
  { value: '6h', label: 'Last 6 hours', short: '6H' },
  { value: '24h', label: 'Last 24 hours', short: '24H' },
  { value: '7d', label: 'Last 7 days', short: '7D' },
  { value: '30d', label: 'Last 30 days', short: '30D' },
];

export const ENVIRONMENTS = [
  { value: 'all', label: 'All Environments' },
  { value: 'production', label: 'Production' },
  { value: 'staging', label: 'Staging' },
  { value: 'development', label: 'Development' },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  operator: 'Operator',
  viewer: 'Viewer',
};

/** Series colours for non-provider metrics (categorical slots in fixed order). */
export const SERIES = {
  s1: 'var(--series-1)',
  s2: 'var(--series-2)',
  s3: 'var(--series-3)',
  s4: 'var(--series-4)',
  s5: 'var(--series-5)',
  s6: 'var(--series-6)',
};

export const REFRESH_INTERVAL_MS = 30_000;
