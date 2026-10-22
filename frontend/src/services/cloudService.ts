import { del, get, post, put } from './api';
import type { CloudAccount, ConnectionPayload, ProviderOverview, ServiceHealthResponse, SyncResult, ValidationResult } from '../types/cloud';

export const cloudService = {
  providers: () => get<ProviderOverview[]>('/cloud-accounts/providers'),
  accounts: (provider?: string) => get<CloudAccount[]>('/cloud-accounts', { provider }),
  account: (id: string) => get<CloudAccount>(`/cloud-accounts/${id}`),
  validate: (payload: ConnectionPayload) => post<ValidationResult>('/cloud-accounts/validate', payload),
  connect: (payload: ConnectionPayload) =>
    post<{ account: CloudAccount; sync: SyncResult; validation: ValidationResult }>('/cloud-accounts', payload),
  update: (id: string, data: { accountName?: string; environment?: string; status?: 'connected' | 'disconnected' }) =>
    put<CloudAccount>(`/cloud-accounts/${id}`, data),
  remove: (id: string) => del<{ removedResources: number }>(`/cloud-accounts/${id}`),
  sync: (id: string) => post<SyncResult>(`/cloud-accounts/${id}/sync`),
  serviceHealth: () => get<ServiceHealthResponse>('/service-health'),
};
