import { del, get, getPaginated, post, put } from './api';
import type { Resource, ResourceFacets, ResourceQuery } from '../types/resource';
import type { Alert } from '../types/alert';
import type { ResourceMetrics } from '../types/metrics';
import type { TimeRange } from '../types/common';

export const resourceService = {
  list: (query: ResourceQuery) => getPaginated<Resource, { facets: ResourceFacets }>('/resources', { ...query }),
  get: (id: string) => get<{ resource: Resource; alerts: Alert[] }>(`/resources/${encodeURIComponent(id)}`),
  metrics: (id: string, range: TimeRange) => get<ResourceMetrics>(`/resources/${encodeURIComponent(id)}/metrics`, { range }),
  create: (data: Partial<Resource> & { cloudAccountId: string }) => post<{ resource: Resource }>('/resources', data),
  update: (id: string, data: Partial<Resource>) => put<{ resource: Resource }>(`/resources/${id}`, data),
  remove: (id: string) => del(`/resources/${id}`),
};
