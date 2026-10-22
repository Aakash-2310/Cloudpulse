import type { PipelineStage, FilterQuery } from 'mongoose';
import { CostRecord, type ICostRecord } from '../models/CostRecord';
import { Resource } from '../models/Resource';
import { PROVIDERS, PROVIDER_LABELS, type Provider } from '../models/types';
import { DAY_MS, startOfUtcDay } from '../mock/random';
import { env } from '../config/env';
import { CacheKeys, buildKey, cached } from './redisService';
import { escapeRegex, round } from '../utils/http';

export const STORAGE_SERVICES = ['S3', 'Blob Storage', 'Cloud Storage'];

function monthStart(date: Date, offsetMonths = 0): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offsetMonths, 1));
}

async function sumBetween(from: Date, to: Date, extra: FilterQuery<ICostRecord> = {}): Promise<number> {
  const [row] = await CostRecord.aggregate<{ total: number }>([
    { $match: { date: { $gte: from, $lt: to }, ...extra } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return round(row?.total ?? 0);
}

async function groupBetween(field: 'provider' | 'service' | 'region', from: Date, to: Date, extra: FilterQuery<ICostRecord> = {}) {
  const rows = await CostRecord.aggregate<{ _id: string; amount: number; provider?: string }>([
    { $match: { date: { $gte: from, $lt: to }, ...extra } },
    { $group: { _id: `$${field}`, amount: { $sum: '$amount' }, provider: { $first: '$provider' } } },
    { $sort: { amount: -1 } },
  ]);
  const total = rows.reduce((s, r) => s + r.amount, 0) || 1;
  return rows.map((r) => ({
    name: r._id,
    provider: r.provider,
    amount: round(r.amount),
    share: round((r.amount / total) * 100, 1),
  }));
}

/** Window helpers: the last N complete billing days (billing data lags one day). */
function lastDays(n: number, endOffsetDays = 0) {
  const end = new Date(startOfUtcDay(new Date()).getTime() - endOffsetDays * DAY_MS);
  return { from: new Date(end.getTime() - n * DAY_MS), to: end };
}

export async function getLast30DaysCost(): Promise<{ total: number; previous: number; changePct: number }> {
  const cur = lastDays(30);
  const prev = lastDays(30, 30);
  const [total, previous] = await Promise.all([sumBetween(cur.from, cur.to), sumBetween(prev.from, prev.to)]);
  return { total, previous, changePct: previous ? round(((total - previous) / previous) * 100, 1) : 0 };
}

export async function getCostSummary() {
  return cached(buildKey(CacheKeys.costs, { view: 'summary' }), env.cacheTtl.costs, async () => {
    const now = new Date();
    const today = startOfUtcDay(now);
    const mStart = monthStart(now);
    const prevStart = monthStart(now, -1);
    const elapsedDays = Math.max(1, Math.round((today.getTime() - mStart.getTime()) / DAY_MS));
    const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();

    const last7 = lastDays(7);
    const yesterday = lastDays(1);
    const [currentMonth, previousMonth, previousMonthToDate, last7Total, dailyCost, last30] = await Promise.all([
      sumBetween(mStart, today),
      sumBetween(prevStart, mStart),
      sumBetween(prevStart, new Date(prevStart.getTime() + elapsedDays * DAY_MS)),
      sumBetween(last7.from, last7.to),
      sumBetween(yesterday.from, yesterday.to),
      getLast30DaysCost(),
    ]);
    const avgDaily7 = last7Total / 7;
    // Forecast = month-to-date + average of the last 7 days for every remaining day (incl. today).
    const forecast = round(currentMonth + avgDaily7 * (daysInMonth - elapsedDays));

    return {
      currency: 'USD',
      currentMonth,
      previousMonth,
      previousMonthToDate,
      monthToDateChangePct: previousMonthToDate ? round(((currentMonth - previousMonthToDate) / previousMonthToDate) * 100, 1) : 0,
      forecast,
      forecastChangePct: previousMonth ? round(((forecast - previousMonth) / previousMonth) * 100, 1) : 0,
      dailyCost,
      dailyAverage: round(avgDaily7),
      last30Days: last30.total,
      last30DaysChangePct: last30.changePct,
      daysElapsed: elapsedDays,
      daysInMonth,
    };
  });
}

export async function getCostBreakdown(field: 'provider' | 'service' | 'region', days = 30, provider?: string) {
  return cached(buildKey(CacheKeys.costs, { view: field, days, provider }), env.cacheTtl.costs, async () => {
    const { from, to } = lastDays(days);
    const prev = lastDays(days, days);
    const extra: FilterQuery<ICostRecord> = provider && provider !== 'all' ? { provider } : {};
    const [current, previous] = await Promise.all([groupBetween(field, from, to, extra), groupBetween(field, prev.from, prev.to, extra)]);
    const prevMap = new Map<string, number>(previous.map((p) => [p.name, p.amount]));
    return current.map((c) => {
      const before = prevMap.get(c.name) ?? 0;
      return {
        ...c,
        label: field === 'provider' ? PROVIDER_LABELS[c.name as Provider] ?? c.name : c.name,
        previous: round(before),
        changePct: before ? round(((c.amount - before) / before) * 100, 1) : null,
      };
    });
  });
}

/** Monthly totals per provider for the last `months` months (current month is month-to-date). */
export async function getMonthlyTrend(months = 6) {
  return cached(buildKey(CacheKeys.costs, { view: 'monthly', months }), env.cacheTtl.costs, async () => {
    const now = new Date();
    const from = monthStart(now, -(months - 1));
    const rows = await CostRecord.aggregate<{ _id: { y: number; m: number; p: string }; amount: number }>([
      { $match: { date: { $gte: from } } },
      { $group: { _id: { y: { $year: '$date' }, m: { $month: '$date' }, p: '$provider' }, amount: { $sum: '$amount' } } },
    ]);
    const out: Array<Record<string, number | string>> = [];
    for (let i = 0; i < months; i += 1) {
      const d = monthStart(now, -(months - 1) + i);
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      const entry: Record<string, number | string> = {
        month: `${y}-${String(m).padStart(2, '0')}`,
        label: d.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      };
      let total = 0;
      for (const p of PROVIDERS) {
        const amount = rows.find((r) => r._id.y === y && r._id.m === m && r._id.p === p)?.amount ?? 0;
        entry[p] = round(amount);
        total += amount;
      }
      entry.total = round(total);
      entry.partial = i === months - 1 ? 1 : 0;
      out.push(entry);
    }
    return out;
  });
}

/** Daily spend per provider for the last `days` days. */
export async function getDailyTrend(days = 30, services?: string[]) {
  return cached(buildKey(CacheKeys.costs, { view: 'daily', days, services: services?.join('|') }), env.cacheTtl.costs, async () => {
    const { from, to } = lastDays(days);
    const match: FilterQuery<ICostRecord> = { date: { $gte: from, $lt: to } };
    if (services?.length) match.service = { $in: services };
    const rows = await CostRecord.aggregate<{ _id: { d: Date; p: string }; amount: number }>([
      { $match: match },
      { $group: { _id: { d: '$date', p: '$provider' }, amount: { $sum: '$amount' } } },
    ]);
    const out: Array<Record<string, number | string>> = [];
    for (let t = from.getTime(); t < to.getTime(); t += DAY_MS) {
      const entry: Record<string, number | string> = { date: new Date(t).toISOString().slice(0, 10) };
      let total = 0;
      for (const p of PROVIDERS) {
        const amount = rows.find((r) => new Date(r._id.d).getTime() === t && r._id.p === p)?.amount ?? 0;
        entry[p] = round(amount);
        total += amount;
      }
      entry.total = round(total);
      out.push(entry);
    }
    return out;
  });
}

export async function listCostRecords(query: {
  provider?: string;
  service?: string;
  region?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
  skip: number;
}) {
  const filter: FilterQuery<ICostRecord> = {};
  if (query.provider && query.provider !== 'all') filter.provider = query.provider;
  if (query.service) filter.service = new RegExp(`^${escapeRegex(query.service)}$`, 'i');
  if (query.region) filter.region = query.region;
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = query.from;
    if (query.to) filter.date.$lte = query.to;
  }
  const [items, total] = await Promise.all([
    CostRecord.find(filter).sort({ date: -1, amount: -1 }).skip(query.skip).limit(query.limit).lean(),
    CostRecord.countDocuments(filter),
  ]);
  return { items, total };
}

export interface CostAnomaly {
  id: string;
  type: 'week-over-week' | 'daily-spike' | 'new-service' | 'resource-creation';
  date: string;
  provider: Provider;
  service: string;
  expected: number;
  actual: number;
  difference: number;
  differencePct: number;
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

function severityFor(pct: number): CostAnomaly['severity'] {
  if (pct >= 75) return 'critical';
  if (pct >= 30) return 'warning';
  return 'info';
}

/**
 * Basic statistical anomaly detection:
 *  1. Week-over-week: provider+service spend in the last 7 days vs the previous 7 days (> threshold %).
 *  2. Daily spike: a single day more than 3σ above the trailing 14-day mean (and > 50% above it).
 *  3. New service spend: service with spend in the last 7 days and none in the previous 30.
 *  4. Sudden resource creation: 3+ resources created in one provider within 7 days.
 */
export async function detectAnomalies(thresholdPct = 20): Promise<CostAnomaly[]> {
  return cached(buildKey(CacheKeys.costs, { view: 'anomalies', thresholdPct }), env.cacheTtl.costs, async () => {
    const today = startOfUtcDay(new Date());
    const from = new Date(today.getTime() - 44 * DAY_MS);
    const rows = await CostRecord.aggregate<{ _id: { p: Provider; s: string; d: Date }; amount: number }>([
      { $match: { date: { $gte: from, $lt: today } } },
      { $group: { _id: { p: '$provider', s: '$service', d: '$date' }, amount: { $sum: '$amount' } } },
    ] as PipelineStage[]);

    const series = new Map<string, Map<number, number>>();
    for (const r of rows) {
      const key = `${r._id.p}|${r._id.s}`;
      if (!series.has(key)) series.set(key, new Map());
      series.get(key)!.set(new Date(r._id.d).getTime(), r.amount);
    }

    const anomalies: CostAnomaly[] = [];
    const dayVal = (m: Map<number, number>, daysAgo: number) => m.get(today.getTime() - daysAgo * DAY_MS) ?? 0;

    for (const [key, m] of series) {
      const [provider, service] = key.split('|') as [Provider, string];
      const label = PROVIDER_LABELS[provider];

      // 1. Week over week
      let last7 = 0;
      let prev7 = 0;
      for (let d = 1; d <= 7; d += 1) last7 += dayVal(m, d);
      for (let d = 8; d <= 14; d += 1) prev7 += dayVal(m, d);
      if (prev7 > 0) {
        const pct = ((last7 - prev7) / prev7) * 100;
        if (pct > thresholdPct && last7 - prev7 >= 50) {
          anomalies.push({
            id: `wow-${provider}-${service}`.replace(/\s+/g, '-').toLowerCase(),
            type: 'week-over-week',
            date: new Date(today.getTime() - DAY_MS).toISOString().slice(0, 10),
            provider,
            service,
            expected: round(prev7),
            actual: round(last7),
            difference: round(last7 - prev7),
            differencePct: round(pct, 1),
            severity: severityFor(pct),
            message: `${label} ${service} spending increased by ${Math.round(pct)}% compared with the previous week.`,
          });
        }
      }

      // 2. Daily spikes in the last 14 days, each compared with its trailing 14-day window
      for (let d = 1; d <= 14; d += 1) {
        const window: number[] = [];
        for (let w = d + 1; w <= d + 14; w += 1) window.push(dayVal(m, w));
        const mean = window.reduce((s, v) => s + v, 0) / window.length;
        if (mean <= 0) continue;
        const sd = Math.sqrt(window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length) || mean * 0.05;
        const actual = dayVal(m, d);
        const pct = ((actual - mean) / mean) * 100;
        if (actual > mean + 3 * sd && pct > 50 && actual - mean >= 25) {
          const date = new Date(today.getTime() - d * DAY_MS).toISOString().slice(0, 10);
          anomalies.push({
            id: `spike-${provider}-${service}-${date}`.replace(/\s+/g, '-').toLowerCase(),
            type: 'daily-spike',
            date,
            provider,
            service,
            expected: round(mean),
            actual: round(actual),
            difference: round(actual - mean),
            differencePct: round(pct, 1),
            severity: severityFor(pct),
            message: `Abnormally high daily ${label} ${service} usage on ${date}: ${Math.round(pct)}% above the 14-day average.`,
          });
        }
      }

      // 3. New service spending
      let prior30 = 0;
      for (let d = 8; d <= 37; d += 1) prior30 += dayVal(m, d);
      if (prior30 === 0 && last7 > 25) {
        anomalies.push({
          id: `new-${provider}-${service}`.replace(/\s+/g, '-').toLowerCase(),
          type: 'new-service',
          date: new Date(today.getTime() - DAY_MS).toISOString().slice(0, 10),
          provider,
          service,
          expected: 0,
          actual: round(last7),
          difference: round(last7),
          differencePct: 100,
          severity: 'warning',
          message: `Unexpected spending on ${label} ${service}: $${Math.round(last7)} in the last 7 days with no prior usage.`,
        });
      }
    }

    // 4. Sudden resource creation
    const weekAgo = new Date(Date.now() - 7 * DAY_MS);
    const created = await Resource.aggregate<{ _id: Provider; count: number; cost: number; latest: Date }>([
      { $match: { createdAt: { $gte: weekAgo } } },
      { $group: { _id: '$provider', count: { $sum: 1 }, cost: { $sum: '$cost' }, latest: { $max: '$createdAt' } } },
    ]);
    for (const c of created) {
      if (c.count >= 3) {
        anomalies.push({
          id: `creation-${c._id}`,
          type: 'resource-creation',
          date: new Date(c.latest).toISOString().slice(0, 10),
          provider: c._id,
          service: 'Multiple',
          expected: 0,
          actual: round(c.cost),
          difference: round(c.cost),
          differencePct: 100,
          severity: c.count >= 6 ? 'critical' : 'warning',
          message: `${c.count} new ${PROVIDER_LABELS[c._id]} resources were created in the last 7 days (≈$${Math.round(c.cost)}/month).`,
        });
      }
    }

    const order = { critical: 0, warning: 1, info: 2 };
    return anomalies.sort((a, b) => order[a.severity] - order[b.severity] || b.difference - a.difference);
  });
}

/** Month-to-date storage spend vs the same period last month. */
export async function getStorageCostChange() {
  const now = new Date();
  const today = startOfUtcDay(now);
  const mStart = monthStart(now);
  const prevStart = monthStart(now, -1);
  const elapsed = Math.max(1, Math.round((today.getTime() - mStart.getTime()) / DAY_MS));
  const filter = { service: { $in: STORAGE_SERVICES } };
  const [current, previous] = await Promise.all([
    sumBetween(mStart, today, filter),
    sumBetween(prevStart, new Date(prevStart.getTime() + elapsed * DAY_MS), filter),
  ]);
  return { current, previous, changePct: previous ? round(((current - previous) / previous) * 100, 1) : 0 };
}
