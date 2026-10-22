import { get, getPaginated } from './api';
import type { CostAnomaly, CostBreakdownItem, CostRecord, CostSummary } from '../types/cost';

export const costService = {
  summary: () => get<CostSummary>('/costs/summary'),
  byProvider: (days = 30) => get<CostBreakdownItem[]>('/costs/by-provider', { days }),
  byService: (days = 30, provider?: string) => get<CostBreakdownItem[]>('/costs/by-service', { days, provider }),
  byRegion: (days = 30, provider?: string) => get<CostBreakdownItem[]>('/costs/by-region', { days, provider }),
  anomalies: (threshold = 20) => get<CostAnomaly[]>('/costs/anomalies', { threshold }),
  records: (q: { page?: number; limit?: number; provider?: string; service?: string; region?: string }) =>
    getPaginated<CostRecord>('/costs', q),
};
