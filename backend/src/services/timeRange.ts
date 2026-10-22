import { AppError } from '../utils/http';

export const TIME_RANGES = {
  '1h': { ms: 3_600_000, binMinutes: 5, label: 'Last 1 hour' },
  '6h': { ms: 6 * 3_600_000, binMinutes: 15, label: 'Last 6 hours' },
  '24h': { ms: 24 * 3_600_000, binMinutes: 60, label: 'Last 24 hours' },
  '7d': { ms: 7 * 86_400_000, binMinutes: 360, label: 'Last 7 days' },
  '30d': { ms: 30 * 86_400_000, binMinutes: 1440, label: 'Last 30 days' },
} as const;

export type TimeRange = keyof typeof TIME_RANGES;

export function resolveRange(value: unknown, fallback: TimeRange = '24h') {
  const key = (typeof value === 'string' && value in TIME_RANGES ? value : fallback) as TimeRange;
  if (value !== undefined && value !== '' && !(String(value) in TIME_RANGES)) {
    throw new AppError(400, `Invalid range. Use one of: ${Object.keys(TIME_RANGES).join(', ')}`);
  }
  const cfg = TIME_RANGES[key];
  const to = new Date();
  const from = new Date(to.getTime() - cfg.ms);
  return { key, from, to, binMinutes: cfg.binMinutes, label: cfg.label };
}

/** Mongo $dateTrunc expression that buckets `$timestamp` into bins of `binMinutes`. */
export function bucketExpr(binMinutes: number) {
  if (binMinutes % 1440 === 0) return { $dateTrunc: { date: '$timestamp', unit: 'day', binSize: binMinutes / 1440 } };
  if (binMinutes % 60 === 0) return { $dateTrunc: { date: '$timestamp', unit: 'hour', binSize: binMinutes / 60 } };
  return { $dateTrunc: { date: '$timestamp', unit: 'minute', binSize: binMinutes } };
}
