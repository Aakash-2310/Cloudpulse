import { resourceService } from '../services/resourceService';
import type { TimeRange } from '../types/common';
import { useFetch } from './useFetch';

/** Time-series metrics for one resource; refreshes every 30s for short ranges. */
export function useMetrics(resourceId: string | undefined, range: TimeRange) {
  const live = range === '1h' || range === '6h' || range === '24h';
  return useFetch(() => resourceService.metrics(resourceId!, range), [resourceId, range], {
    enabled: Boolean(resourceId),
    refreshInterval: live ? 30_000 : 0,
  });
}
