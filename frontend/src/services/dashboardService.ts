import { del, download, get, post, put } from './api';
import type { ComputeOverview, DashboardMetrics, DashboardSummary, InsightsResponse, NetworkOverview, StorageOverview } from '../types/metrics';
import type { TimeRange } from '../types/common';
import type { User, UserRole } from '../types/auth';

export interface SearchResults {
  resources: Array<{ _id: string; name: string; provider: string; type: string; region: string; status: string; service: string }>;
  accounts: Array<{ _id: string; accountName: string; accountId: string; provider: string; status: string }>;
  services: Array<{ _id: string; name: string; status: string; category: string; provider: string }>;
  alerts: Array<{ _id: string; title: string; severity: string; status: string; createdAt: string }>;
}

export interface SystemStatus {
  environment: string;
  providerMode: string;
  demoMode: boolean;
  mongodb: string;
  redis: string;
  cache: { hits: number; misses: number; ttl: Record<string, number> };
  monitoring: { enabled: boolean; intervalMs: number; lastCycle: { at: string; durationMs: number; samples: number; alerts: number } | null };
  counts: Record<string, number>;
  uptimeSeconds: number;
  nodeVersion: string;
}

export const dashboardService = {
  summary: (environment?: string) => get<DashboardSummary>('/dashboard/summary', { environment }),
  metrics: (range: TimeRange, environment?: string) => get<DashboardMetrics>('/dashboard/metrics', { range, environment }),
  insights: (environment?: string) => get<InsightsResponse>('/dashboard/insights', { environment }),
  compute: (range: TimeRange, environment?: string, provider?: string) =>
    get<ComputeOverview>('/monitoring/compute', { range, environment, provider }),
  storage: (environment?: string, provider?: string) => get<StorageOverview>('/monitoring/storage', { environment, provider }),
  network: (range: TimeRange, environment?: string, provider?: string) =>
    get<NetworkOverview>('/monitoring/network', { range, environment, provider }),
};

export const systemService = {
  search: (q: string) => get<SearchResults>('/search', { q }),
  status: () => get<SystemStatus>('/system/status'),
  runMonitoring: () => post('/system/monitoring/run'),
  exportReport: (type: 'resources' | 'alerts' | 'costs' | 'service-health' | 'summary', params?: Record<string, unknown>) =>
    download(`/reports/${type}`, params),
  users: () => get<User[]>('/users'),
  createUser: (data: { name: string; email: string; password: string; role: UserRole; title?: string }) => post<User>('/users', data),
  updateUser: (id: string, data: { name?: string; role?: UserRole; title?: string; active?: boolean }) => put<User>(`/users/${id}`, data),
  deleteUser: (id: string) => del(`/users/${id}`),
};
