import mongoose, { type FilterQuery } from 'mongoose';
import { Resource, type IResource } from '../models/Resource';
import { Metric } from '../models/Metric';
import { CloudAccount } from '../models/CloudAccount';
import { ServiceHealth } from '../models/ServiceHealth';
import { COMPUTE_TYPES, PROVIDERS, PROVIDER_LABELS, type HealthStatus, type Provider } from '../models/types';
import { getRedis } from '../config/redis';
import { env } from '../config/env';
import { getPlatformProvider, getProvider } from '../providers';
import type { MetricSample } from '../providers/CloudProvider';
import { CacheKeys, buildKey, cached, invalidate } from './redisService';
import { bucketExpr, resolveRange } from './timeRange';
import { getRecentAlerts, alertCounts, evaluateAlertRules } from './alertService';
import { getCostBreakdown, getLast30DaysCost, getStorageCostChange, STORAGE_SERVICES, getDailyTrend } from './costService';
import { ensureCostsUpToDate } from './cloudService';
import { latestDate, round } from '../utils/http';
import { THRESHOLDS, deriveStatus, storagePct, toMetricContext } from './resourceHealth';
import { logger } from '../utils/logger';

/* ------------------------------------------------------------------ */
/* Status & helpers                                                    */
/* ------------------------------------------------------------------ */

export { THRESHOLDS, storagePct, deriveStatus, toMetricContext };

export function environmentFilter(environment?: string): FilterQuery<IResource> {
  return environment && environment !== 'all' ? { environment } : {};
}

function worst(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes('critical')) return 'critical';
  if (statuses.includes('warning')) return 'warning';
  if (statuses.includes('healthy')) return 'healthy';
  return 'unknown';
}

/* ------------------------------------------------------------------ */
/* Health score                                                        */
/* ------------------------------------------------------------------ */

async function statusCounts(match: FilterQuery<IResource>) {
  const rows = await Resource.aggregate<{ _id: string; count: number }>([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
  const counts = { healthy: 0, warning: 0, critical: 0, unknown: 0 };
  for (const r of rows) counts[r._id as HealthStatus] = r.count;
  return counts;
}

/**
 * Infrastructure health score (0–100):
 *  70% resource health (healthy = 1, warning = 0.6, critical = 0) over monitored (non-stopped) resources
 *  30% service health (healthy = 1, warning = 0.5, critical = 0)
 *  minus 1 point per active critical alert (max 10).
 */
export async function computeHealthScore(environment?: string) {
  const [counts, services, alerts] = await Promise.all([
    statusCounts(environmentFilter(environment)),
    ServiceHealth.find().select('status').lean(),
    alertCounts(),
  ]);
  const monitored = counts.healthy + counts.warning + counts.critical;
  const resourceScore = monitored ? (counts.healthy + counts.warning * 0.6) / monitored : 1;
  const svcTotal = services.filter((s) => s.status !== 'unknown').length;
  const svcScore = svcTotal
    ? services.reduce((s, x) => s + (x.status === 'healthy' ? 1 : x.status === 'warning' ? 0.5 : 0), 0) / svcTotal
    : 1;
  const penalty = Math.min(10, alerts.critical);
  const score = Math.max(0, Math.min(100, Math.round((resourceScore * 0.7 + svcScore * 0.3) * 100 - penalty)));
  const grade = score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 60 ? 'fair' : 'poor';
  return {
    score,
    grade,
    components: {
      resources: round(resourceScore * 100, 1),
      services: round(svcScore * 100, 1),
      criticalAlertPenalty: penalty,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export async function getProviderHealth(environment?: string) {
  const match = environmentFilter(environment);
  const [rows, accounts, costs] = await Promise.all([
    Resource.aggregate<{ _id: { p: Provider; s: HealthStatus }; count: number }>([
      { $match: match },
      { $group: { _id: { p: '$provider', s: '$status' }, count: { $sum: 1 } } },
    ]),
    CloudAccount.find().select('provider status regions lastSync').lean(),
    getCostBreakdown('provider', 30),
  ]);
  return PROVIDERS.filter((p) => accounts.some((a) => a.provider === p)).map((p) => {
    const counts = { healthy: 0, warning: 0, critical: 0, unknown: 0 };
    rows.filter((r) => r._id.p === p).forEach((r) => (counts[r._id.s] = r.count));
    const accs = accounts.filter((a) => a.provider === p);
    const total = counts.healthy + counts.warning + counts.critical + counts.unknown;
    const connectionError = accs.some((a) => a.status === 'error');
    // Provider is "critical" only when >10% of its resources are critical or a connection fails.
    let status: HealthStatus = 'healthy';
    if (connectionError || (total && counts.critical / total > 0.1)) status = 'critical';
    else if (counts.critical > 0 || (total && counts.warning / total > 0.15)) status = 'warning';
    return {
      provider: p,
      label: PROVIDER_LABELS[p],
      status,
      resources: total,
      ...counts,
      accounts: accs.length,
      regions: new Set(accs.flatMap((a) => a.regions ?? [])).size,
      cost: costs.find((c) => c.name === p)?.amount ?? 0,
      lastSync: latestDate(accs.map((a) => a.lastSync)),
    };
  });
}

export async function getDashboardSummary(environment?: string) {
  return cached(buildKey(CacheKeys.dashboard, { view: 'summary', environment }), env.cacheTtl.dashboard, async () => {
    const match = environmentFilter(environment);
    const [counts, providers, accounts, cost, health, recentAlerts, alerts] = await Promise.all([
      statusCounts(match),
      getProviderHealth(environment),
      CloudAccount.countDocuments(),
      getLast30DaysCost(),
      computeHealthScore(environment),
      getRecentAlerts(6),
      alertCounts(),
    ]);
    const totalResources = counts.healthy + counts.warning + counts.critical + counts.unknown;
    return {
      kpis: {
        cloudProviders: providers.length,
        cloudAccounts: accounts,
        totalResources,
        healthy: counts.healthy,
        warning: counts.warning,
        critical: counts.critical,
        unknown: counts.unknown,
        monthlyCost: cost.total,
        monthlyCostChangePct: cost.changePct,
        activeAlerts: alerts.active,
        criticalAlerts: alerts.critical,
      },
      healthScore: health,
      providers,
      recentAlerts,
      generatedAt: new Date().toISOString(),
    };
  });
}

interface TimelinePoint {
  timestamp: string;
  cpu: number;
  memory: number;
  networkIn: number;
  networkOut: number;
  requests: number;
  errors: number;
  errorRate: number;
  disk: number;
  resources: number;
}

/**
 * Two-stage aggregation: first average each resource inside a time bin (so resources with
 * more samples don't dominate), then combine resources per bin (avg for %, sum for throughput).
 */
export async function aggregateTimeline(resourceIds: string[] | null, from: Date, to: Date, binMinutes: number): Promise<TimelinePoint[]> {
  const match: Record<string, unknown> = { timestamp: { $gte: from, $lte: to } };
  if (resourceIds) match.resourceId = { $in: resourceIds };
  const rows = await Metric.aggregate<{
    _id: Date;
    cpu: number;
    memory: number;
    networkIn: number;
    networkOut: number;
    requests: number;
    errors: number;
    disk: number;
    resources: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: { bucket: bucketExpr(binMinutes), resourceId: '$resourceId' },
        cpu: { $avg: '$cpu' },
        memory: { $avg: '$memory' },
        networkIn: { $avg: '$networkIn' },
        networkOut: { $avg: '$networkOut' },
        requests: { $avg: '$requestCount' },
        errors: { $avg: { $multiply: ['$requestCount', { $divide: ['$errorRate', 100] }] } },
        disk: { $avg: '$diskUsage' },
      },
    },
    {
      $group: {
        _id: '$_id.bucket',
        cpu: { $avg: '$cpu' },
        memory: { $avg: '$memory' },
        networkIn: { $sum: '$networkIn' },
        networkOut: { $sum: '$networkOut' },
        requests: { $sum: '$requests' },
        errors: { $sum: '$errors' },
        disk: { $avg: '$disk' },
        resources: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  // Drop a trailing partial bin that has far fewer resources than the rest (keeps lines from dipping).
  const maxRes = rows.reduce((m, r) => Math.max(m, r.resources), 0);
  return rows
    .filter((r, i) => !(i === rows.length - 1 && r.resources < maxRes * 0.6))
    .map((r) => ({
      timestamp: new Date(r._id).toISOString(),
      cpu: round(r.cpu, 1),
      memory: round(r.memory, 1),
      networkIn: round(r.networkIn, 1),
      networkOut: round(r.networkOut, 1),
      requests: Math.round(r.requests),
      errors: round(r.errors, 1),
      errorRate: r.requests ? round((r.errors / r.requests) * 100, 2) : 0,
      disk: round(r.disk, 1),
      resources: r.resources,
    }));
}

async function idsFor(match: FilterQuery<IResource>): Promise<string[] | null> {
  if (!Object.keys(match).length) return null;
  const docs = await Resource.find(match).select('resourceId').lean();
  return docs.map((d) => d.resourceId);
}

export async function getDashboardMetrics(rangeParam: unknown, environment?: string) {
  const range = resolveRange(rangeParam, '24h');
  return cached(buildKey(CacheKeys.dashboard, { view: 'metrics', range: range.key, environment }), env.cacheTtl.dashboard, async () => {
    const ids = await idsFor(environmentFilter(environment));
    const [timeline, costByProvider, dailyCost] = await Promise.all([
      aggregateTimeline(ids, range.from, range.to, range.binMinutes),
      getCostBreakdown('provider', 30),
      getDailyTrend(14),
    ]);
    return { range: range.key, binMinutes: range.binMinutes, timeline, costByProvider, dailyCost };
  });
}

/* ------------------------------------------------------------------ */
/* Compute / Storage / Network                                         */
/* ------------------------------------------------------------------ */

export async function getComputeOverview(rangeParam: unknown, environment?: string, provider?: string) {
  const range = resolveRange(rangeParam, '24h');
  return cached(
    buildKey(CacheKeys.monitoring, { view: 'compute', range: range.key, environment, provider }),
    env.cacheTtl.resources,
    async () => {
      const match: FilterQuery<IResource> = { type: { $in: COMPUTE_TYPES }, ...environmentFilter(environment) };
      if (provider && provider !== 'all') match.provider = provider;
      const resources = await Resource.find(match).select('-tags').lean();
      const running = resources.filter((r) => r.state === 'running');
      const avg = (vals: number[]) => (vals.length ? round(vals.reduce((s, v) => s + v, 0) / vals.length, 1) : 0);
      const ids = resources.map((r) => r.resourceId);
      const timeline = ids.length ? await aggregateTimeline(ids, range.from, range.to, range.binMinutes) : [];

      const byProvider = PROVIDERS.map((p) => {
        const list = resources.filter((r) => r.provider === p);
        return {
          provider: p,
          label: PROVIDER_LABELS[p],
          total: list.length,
          running: list.filter((r) => r.state === 'running').length,
          avgCpu: avg(list.filter((r) => r.state === 'running').map((r) => r.cpu)),
        };
      }).filter((p) => p.total > 0);

      const byType = COMPUTE_TYPES.map((t) => ({ type: t, count: resources.filter((r) => r.type === t).length })).filter((t) => t.count);

      const statuses = { healthy: 0, warning: 0, critical: 0, unknown: 0 };
      resources.forEach((r) => (statuses[r.status as HealthStatus] += 1));

      const topConsumers = [...running]
        .sort((a, b) => b.cpu + b.memory * 0.5 - (a.cpu + a.memory * 0.5))
        .slice(0, 8)
        .map((r) => ({
          _id: r._id,
          name: r.name,
          provider: r.provider,
          type: r.type,
          sku: r.sku,
          region: r.region,
          cpu: r.cpu,
          memory: r.memory,
          status: r.status,
          cost: r.cost,
        }));

      const underutilized = running.filter((r) => r.cpu < 10 && r.type === 'virtual-machine');
      return {
        range: range.key,
        totals: {
          instances: resources.length,
          running: running.length,
          stopped: resources.filter((r) => r.state === 'stopped').length,
          avgCpu: avg(running.map((r) => r.cpu)),
          avgMemory: avg(running.map((r) => r.memory)),
          healthy: statuses.healthy,
          warning: statuses.warning,
          critical: statuses.critical,
          vcpuHours: Math.round(running.length * 24 * 4),
        },
        statusDistribution: Object.entries(statuses).map(([status, count]) => ({ status, count })),
        stateDistribution: [
          { state: 'running', count: running.length },
          { state: 'stopped', count: resources.filter((r) => r.state === 'stopped').length },
          { state: 'provisioning', count: resources.filter((r) => r.state === 'provisioning').length },
        ],
        byProvider,
        byType,
        timeline: timeline.map((t) => ({ timestamp: t.timestamp, cpu: t.cpu, memory: t.memory })),
        topConsumers,
        underutilized: underutilized.map((r) => ({ _id: r._id, name: r.name, provider: r.provider, cpu: r.cpu, cost: r.cost })),
      };
    },
  );
}

export async function getStorageOverview(environment?: string, provider?: string) {
  return cached(buildKey(CacheKeys.monitoring, { view: 'storage', environment, provider }), env.cacheTtl.resources, async () => {
    const match: FilterQuery<IResource> = { 'storage.totalGB': { $gt: 0 }, ...environmentFilter(environment) };
    if (provider && provider !== 'all') match.provider = provider;
    const resources = await Resource.find(match).select('name resourceId provider type service region storage cost status environment').lean();
    const totalGB = resources.reduce((s, r) => s + (r.storage?.totalGB ?? 0), 0);
    const usedGB = resources.reduce((s, r) => s + (r.storage?.usedGB ?? 0), 0);
    const totals = new Map<string, number>(resources.map((r) => [r.resourceId, r.storage?.totalGB ?? 0]));

    // Growth: daily average disk usage per resource converted back into GB, then summed.
    const from = new Date(Date.now() - 30 * 86_400_000);
    const rows = await Metric.aggregate<{ _id: { day: Date; resourceId: string }; disk: number }>([
      { $match: { timestamp: { $gte: from }, resourceId: { $in: [...totals.keys()] } } },
      { $group: { _id: { day: { $dateTrunc: { date: '$timestamp', unit: 'day' } }, resourceId: '$resourceId' }, disk: { $avg: '$diskUsage' } } },
    ]);
    const byDay = new Map<string, number>();
    for (const r of rows) {
      const day = new Date(r._id.day).toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + (r.disk / 100) * (totals.get(r._id.resourceId) ?? 0));
    }
    const growth = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, used]) => ({ date, usedTB: round(used / 1024, 2) }));
    const first = growth[0]?.usedTB ?? 0;
    const last = growth[growth.length - 1]?.usedTB ?? 0;

    const byProvider = PROVIDERS.map((p) => {
      const list = resources.filter((r) => r.provider === p);
      const t = list.reduce((s, r) => s + (r.storage?.totalGB ?? 0), 0);
      const u = list.reduce((s, r) => s + (r.storage?.usedGB ?? 0), 0);
      return { provider: p, label: PROVIDER_LABELS[p], totalTB: round(t / 1024, 2), usedTB: round(u / 1024, 2), utilization: t ? round((u / t) * 100, 1) : 0 };
    }).filter((p) => p.totalTB > 0);

    const [costTrend, storageCost] = await Promise.all([getDailyTrend(30, STORAGE_SERVICES), getStorageCostChange()]);

    const volumes = resources
      .map((r) => ({
        _id: r._id,
        name: r.name,
        provider: r.provider,
        type: r.type,
        service: r.service,
        region: r.region,
        usedGB: Math.round(r.storage?.usedGB ?? 0),
        totalGB: Math.round(r.storage?.totalGB ?? 0),
        utilization: round(storagePct(r.storage), 1),
        status: r.status,
      }))
      .sort((a, b) => b.utilization - a.utilization);

    return {
      totals: {
        totalTB: round(totalGB / 1024, 2),
        usedTB: round(usedGB / 1024, 2),
        freeTB: round((totalGB - usedGB) / 1024, 2),
        utilization: totalGB ? round((usedGB / totalGB) * 100, 1) : 0,
        growth30dTB: round(last - first, 2),
        growth30dPct: first ? round(((last - first) / first) * 100, 1) : 0,
        monthToDateCost: storageCost.current,
        costChangePct: storageCost.changePct,
        nearCapacity: volumes.filter((v) => v.utilization >= THRESHOLDS.disk.warning).length,
      },
      growth,
      byProvider,
      costTrend: costTrend.map((d) => ({ date: d.date, aws: d.aws, azure: d.azure, gcp: d.gcp, total: d.total })),
      volumes,
    };
  });
}

export async function getNetworkOverview(rangeParam: unknown, environment?: string, provider?: string) {
  const range = resolveRange(rangeParam, '24h');
  return cached(
    buildKey(CacheKeys.monitoring, { view: 'network', range: range.key, environment, provider }),
    env.cacheTtl.resources,
    async () => {
      const match: FilterQuery<IResource> = { state: 'running', ...environmentFilter(environment) };
      if (provider && provider !== 'all') match.provider = provider;
      const resources = await Resource.find(match).select('name provider type region network networkCapacity resourceId status').lean();
      const ids = resources.map((r) => r.resourceId);
      const timeline = ids.length ? await aggregateTimeline(ids, range.from, range.to, range.binMinutes) : [];
      // Bandwidth utilisation = current throughput / provisioned network capacity of the selected resources.
      const capacity = resources.reduce((s, r) => s + (r.networkCapacity ?? 0), 0);
      const currentTraffic = resources.reduce((s, r) => s + (r.network ?? 0), 0);
      const latest = timeline[timeline.length - 1];
      const sum = (k: 'networkIn' | 'networkOut' | 'requests' | 'errors') => timeline.reduce((s, t) => s + t[k], 0);

      const byProvider = PROVIDERS.map((p) => {
        const list = resources.filter((r) => r.provider === p);
        const total = list.reduce((s, r) => s + (r.network ?? 0), 0);
        return { provider: p, label: PROVIDER_LABELS[p], throughputMbps: round(total, 1), resources: list.length };
      }).filter((p) => p.resources > 0);

      const topTalkers = [...resources]
        .sort((a, b) => (b.network ?? 0) - (a.network ?? 0))
        .slice(0, 8)
        .map((r) => ({
          _id: r._id,
          name: r.name,
          provider: r.provider,
          type: r.type,
          region: r.region,
          throughputMbps: round(r.network ?? 0, 1),
          utilization: r.networkCapacity ? round(((r.network ?? 0) / r.networkCapacity) * 100, 1) : 0,
          status: r.status,
        }));

      return {
        range: range.key,
        totals: {
          incomingMbps: round(latest?.networkIn ?? 0, 1),
          outgoingMbps: round(latest?.networkOut ?? 0, 1),
          bandwidthUtilization: capacity ? round((currentTraffic / capacity) * 100, 1) : 0,
          totalCapacityGbps: round(capacity / 1000, 1),
          requestsPerMin: latest?.requests ?? 0,
          errorsPerMin: round(latest?.errors ?? 0, 1),
          errorRate: latest?.errorRate ?? 0,
          avgIncomingMbps: timeline.length ? round(sum('networkIn') / timeline.length, 1) : 0,
          avgOutgoingMbps: timeline.length ? round(sum('networkOut') / timeline.length, 1) : 0,
        },
        timeline: timeline.map((t) => ({
          timestamp: t.timestamp,
          networkIn: t.networkIn,
          networkOut: t.networkOut,
          requests: t.requests,
          errors: t.errors,
          errorRate: t.errorRate,
          bandwidth: capacity ? round(((t.networkIn + t.networkOut) / capacity) * 100, 1) : 0,
        })),
        byProvider,
        topTalkers,
      };
    },
  );
}

/* ------------------------------------------------------------------ */
/* Resource metrics                                                    */
/* ------------------------------------------------------------------ */

export async function getResourceMetrics(resourceId: string, rangeParam: unknown) {
  const range = resolveRange(rangeParam, '24h');
  return cached(buildKey(CacheKeys.resources, { view: 'metrics', resourceId, range: range.key }), env.cacheTtl.resources, async () => {
    const rows = await Metric.aggregate<{
      _id: Date;
      cpu: number;
      memory: number;
      networkIn: number;
      networkOut: number;
      diskUsage: number;
      requestCount: number;
      errorRate: number;
    }>([
      { $match: { resourceId, timestamp: { $gte: range.from, $lte: range.to } } },
      {
        $group: {
          _id: bucketExpr(range.binMinutes),
          cpu: { $avg: '$cpu' },
          memory: { $avg: '$memory' },
          networkIn: { $avg: '$networkIn' },
          networkOut: { $avg: '$networkOut' },
          diskUsage: { $avg: '$diskUsage' },
          requestCount: { $avg: '$requestCount' },
          errorRate: { $avg: '$errorRate' },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    const points = rows.map((r) => ({
      timestamp: new Date(r._id).toISOString(),
      cpu: round(r.cpu, 1),
      memory: round(r.memory, 1),
      networkIn: round(r.networkIn, 1),
      networkOut: round(r.networkOut, 1),
      diskUsage: round(r.diskUsage, 1),
      requestCount: Math.round(r.requestCount),
      errorRate: round(r.errorRate, 2),
    }));
    const stat = (k: keyof (typeof points)[number]) => {
      const vals = points.map((p) => p[k] as number);
      if (!vals.length) return { avg: 0, max: 0, min: 0 };
      return {
        avg: round(vals.reduce((s, v) => s + v, 0) / vals.length, 1),
        max: round(Math.max(...vals), 1),
        min: round(Math.min(...vals), 1),
      };
    };
    return {
      range: range.key,
      binMinutes: range.binMinutes,
      points,
      summary: {
        cpu: stat('cpu'),
        memory: stat('memory'),
        networkIn: stat('networkIn'),
        networkOut: stat('networkOut'),
        diskUsage: stat('diskUsage'),
        requestCount: stat('requestCount'),
        errorRate: stat('errorRate'),
      },
    };
  });
}

/* ------------------------------------------------------------------ */
/* Insights & utilisation                                              */
/* ------------------------------------------------------------------ */

export async function getInsights(environment?: string) {
  return cached(buildKey(CacheKeys.dashboard, { view: 'insights', environment }), env.cacheTtl.dashboard, async () => {
    const match = environmentFilter(environment);
    const resources = await Resource.find(match).select('name resourceId provider type state cpu memory network networkCapacity storage cost status sku').lean();
    const running = resources.filter((r) => r.state === 'running');
    const computeRunning = running.filter((r) => ['virtual-machine', 'container', 'kubernetes-cluster'].includes(r.type));

    const brief = (r: (typeof resources)[number]) => ({
      _id: String(r._id),
      name: r.name,
      provider: r.provider,
      type: r.type,
      cpu: r.cpu,
      memory: r.memory,
      cost: r.cost,
      storageUtilization: round(storagePct(r.storage), 1),
    });

    const underutilized = computeRunning.filter((r) => r.cpu < 10);
    const idle = running.filter((r) => r.type === 'virtual-machine' && r.cpu < 8 && (r.network ?? 0) < 20);
    const overutilized = running.filter((r) => r.cpu >= 85 || r.memory >= 88);
    const nearCapacity = running.filter(
      (r) => r.cpu >= THRESHOLDS.cpu.warning || r.memory >= THRESHOLDS.memory.warning || storagePct(r.storage) >= THRESHOLDS.disk.warning,
    );
    const stopped = resources.filter((r) => r.state === 'stopped');

    const [costByProvider, storageCost, health] = await Promise.all([
      getCostBreakdown('provider', 30),
      getStorageCostChange(),
      computeHealthScore(environment),
    ]);

    // Network traffic change per provider: last 7 days vs previous 7 days.
    const now = Date.now();
    const trafficRows = await Metric.aggregate<{ _id: { resourceId: string; recent: boolean }; net: number }>([
      { $match: { timestamp: { $gte: new Date(now - 14 * 86_400_000) } } },
      {
        $group: {
          _id: { resourceId: '$resourceId', recent: { $gte: ['$timestamp', new Date(now - 7 * 86_400_000)] } },
          net: { $avg: { $add: ['$networkIn', '$networkOut'] } },
        },
      },
    ]);
    const providerOf = new Map<string, Provider>(resources.map((r) => [r.resourceId, r.provider as Provider]));
    const traffic: Record<string, { recent: number; prior: number }> = {};
    for (const row of trafficRows) {
      const p = providerOf.get(row._id.resourceId);
      if (!p) continue;
      traffic[p] ??= { recent: 0, prior: 0 };
      traffic[p][row._id.recent ? 'recent' : 'prior'] += row.net;
    }

    const insights: Array<{ id: string; category: 'cost' | 'performance' | 'capacity' | 'reliability'; severity: 'info' | 'warning' | 'critical' | 'success'; message: string; link?: string }> = [];
    const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

    if (underutilized.length) {
      const savings = underutilized.reduce((s, r) => s + r.cost, 0) * 0.5;
      insights.push({
        id: 'underutilized',
        category: 'cost',
        severity: 'warning',
        message: `${underutilized.length} compute instance${underutilized.length > 1 ? 's have' : ' has'} average CPU utilization below 10% – rightsizing could save about ${fmt(savings)}/month.`,
        link: '/compute',
      });
    }
    if (Math.abs(storageCost.changePct) >= 5) {
      insights.push({
        id: 'storage-cost',
        category: 'cost',
        severity: storageCost.changePct > 0 ? 'warning' : 'success',
        message: `Storage costs ${storageCost.changePct > 0 ? 'increased' : 'decreased'} ${Math.abs(Math.round(storageCost.changePct))}% this month compared with the same period last month.`,
        link: '/storage',
      });
    }
    for (const [p, t] of Object.entries(traffic)) {
      if (!t.prior) continue;
      const pct = ((t.recent - t.prior) / t.prior) * 100;
      if (Math.abs(pct) >= 5) {
        insights.push({
          id: `traffic-${p}`,
          category: 'performance',
          severity: 'info',
          message: `${PROVIDER_LABELS[p as Provider]} network traffic ${pct > 0 ? 'increased' : 'decreased'} ${Math.abs(Math.round(pct))}% over the last 7 days.`,
          link: '/network',
        });
      }
    }
    if (nearCapacity.length) {
      insights.push({
        id: 'capacity',
        category: 'capacity',
        severity: nearCapacity.some((r) => deriveStatus(r) === 'critical') ? 'critical' : 'warning',
        message: `${nearCapacity.length} resource${nearCapacity.length > 1 ? 's are' : ' is'} approaching capacity thresholds.`,
        link: '/resources?status=warning',
      });
    }
    const totalCost = costByProvider.reduce((s, c) => s + c.amount, 0);
    if (costByProvider[0] && totalCost) {
      insights.push({
        id: 'cost-share',
        category: 'cost',
        severity: 'info',
        message: `${costByProvider[0].label} represents ${Math.round((costByProvider[0].amount / totalCost) * 100)}% of current cloud spending.`,
        link: '/costs',
      });
    }
    if (stopped.length) {
      insights.push({
        id: 'stopped',
        category: 'cost',
        severity: 'info',
        message: `${stopped.length} stopped instance${stopped.length > 1 ? 's still incur' : ' still incurs'} storage charges – consider snapshotting and terminating.`,
        link: '/compute',
      });
    }

    const recommendations = [
      ...underutilized.slice(0, 5).map((r) => ({
        resource: brief(r),
        action: 'Rightsize',
        detail: `CPU at ${r.cpu}% on ${r.sku}. Move to a smaller instance class.`,
        estimatedSavings: round(r.cost * 0.5),
      })),
      ...idle
        .filter((r) => !underutilized.includes(r))
        .slice(0, 3)
        .map((r) => ({ resource: brief(r), action: 'Stop or schedule', detail: 'Idle outside business hours.', estimatedSavings: round(r.cost * 0.6) })),
      ...resources
        .filter((r) => r.type === 'object-storage' && storagePct(r.storage) > 80)
        .slice(0, 3)
        .map((r) => ({
          resource: brief(r),
          action: 'Apply lifecycle policy',
          detail: `${round(storagePct(r.storage), 0)}% full. Tier objects older than 90 days to archive storage.`,
          estimatedSavings: round(r.cost * 0.3),
        })),
    ];

    return {
      healthScore: health,
      insights,
      utilization: {
        underutilized: underutilized.map(brief),
        overutilized: overutilized.map(brief),
        idle: idle.map(brief),
      },
      recommendations,
      potentialSavings: round(recommendations.reduce((s, r) => s + r.estimatedSavings, 0)),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Service health                                                      */
/* ------------------------------------------------------------------ */

export async function getServiceHealth() {
  return cached(buildKey(CacheKeys.serviceHealth), env.cacheTtl.serviceHealth, async () => {
    const services = await ServiceHealth.find().sort({ category: 1, name: 1 }).lean();
    const summary = { healthy: 0, warning: 0, critical: 0, unknown: 0 };
    services.forEach((s) => (summary[s.status as HealthStatus] += 1));
    return {
      summary: { ...summary, total: services.length, overall: worst(services.map((s) => s.status as HealthStatus)) },
      services: services.map((s) => ({
        _id: s._id,
        name: s.name,
        category: s.category,
        provider: s.provider,
        description: s.description,
        endpoint: s.endpoint,
        status: s.status,
        uptime: s.uptime,
        responseTime: s.responseTime,
        errorRate: s.errorRate,
        lastChecked: s.lastChecked,
        history: (s.history ?? []).slice(-40),
      })),
    };
  });
}

/** Real checks for the platform's own data stores. */
async function checkDataStores() {
  const results: Array<{ name: string; status: HealthStatus; responseTime: number; errorRate: number }> = [];
  const t0 = Date.now();
  try {
    await mongoose.connection.db?.admin().ping();
    results.push({ name: 'MongoDB', status: 'healthy', responseTime: Date.now() - t0, errorRate: 0 });
  } catch {
    results.push({ name: 'MongoDB', status: 'critical', responseTime: Date.now() - t0, errorRate: 100 });
  }
  const t1 = Date.now();
  const redis = getRedis();
  if (!redis) {
    results.push({ name: 'Redis', status: 'critical', responseTime: 0, errorRate: 100 });
  } else {
    try {
      await redis.ping();
      const rt = Date.now() - t1;
      results.push({ name: 'Redis', status: rt > 250 ? 'warning' : 'healthy', responseTime: rt, errorRate: 0 });
    } catch {
      results.push({ name: 'Redis', status: 'critical', responseTime: Date.now() - t1, errorRate: 100 });
    }
  }
  return results;
}

const HISTORY_LIMIT = 120;

export async function refreshServiceHealth(): Promise<void> {
  const [samples, stores] = await Promise.all([getPlatformProvider().getServiceHealth(), checkDataStores()]);
  const now = new Date();
  const updates = [
    ...samples.map((s) => ({ ...s })),
    ...stores.map((s) => ({
      ...s,
      category: 'data' as const,
      provider: 'platform' as const,
      description: s.name === 'MongoDB' ? 'Primary datastore (live check)' : 'Cache & real-time metrics (live check)',
    })),
  ];
  const ops: Parameters<typeof ServiceHealth.bulkWrite>[0] = [];
  for (const u of updates) {
    ops.push({
      updateOne: {
        filter: { name: u.name },
        update: {
          $set: {
            category: u.category,
            provider: u.provider,
            description: u.description,
            status: u.status,
            responseTime: u.responseTime,
            errorRate: u.errorRate,
            lastChecked: now,
            ...('endpoint' in u && u.endpoint ? { endpoint: u.endpoint } : {}),
          },
          $push: { history: { $each: [{ timestamp: now, status: u.status, responseTime: u.responseTime }], $slice: -HISTORY_LIMIT } },
        },
        upsert: true,
      },
    });
  }
  await ServiceHealth.bulkWrite(ops);
  // Uptime = share of retained checks that were not critical.
  await ServiceHealth.updateMany({}, [
    {
      $set: {
        uptime: {
          $round: [
            {
              $multiply: [
                100,
                {
                  $divide: [
                    { $size: { $filter: { input: '$history', cond: { $ne: ['$$this.status', 'critical'] } } } },
                    { $max: [1, { $size: '$history' }] },
                  ],
                },
              ],
            },
            2,
          ],
        },
      },
    },
  ]);
}

/* ------------------------------------------------------------------ */
/* Monitoring loop                                                     */
/* ------------------------------------------------------------------ */

/** Polls every resource for a fresh sample, stores it and updates current state. */
export async function collectResourceMetrics(): Promise<number> {
  const resources = await Resource.find().select('resourceId provider type state cpu memory network storage baseline').lean();
  if (!resources.length) return 0;
  const samples: MetricSample[] = [];
  const ops: Parameters<typeof Resource.bulkWrite>[0] = [];
  const now = new Date();
  for (const r of resources) {
    let sample: MetricSample;
    try {
      sample = await getProvider(r.provider as Provider).getCurrentMetrics(toMetricContext(r));
    } catch (err) {
      logger.warn(`Metric collection failed for ${r.resourceId}`, (err as Error).message);
      continue;
    }
    samples.push(sample);
    // Storage slowly grows (~0.25 percentage points per day) while running.
    const total = r.storage?.totalGB ?? 0;
    const used = total && r.state === 'running' ? Math.min(total, (r.storage?.usedGB ?? 0) + (total * 0.0025 * env.simulationIntervalMs) / 86_400_000) : r.storage?.usedGB ?? 0;
    const next = {
      cpu: sample.cpu,
      memory: sample.memory,
      network: round(sample.networkIn + sample.networkOut, 1),
      'storage.usedGB': round(used, 2),
      lastSeenAt: now,
    };
    const status = deriveStatus({ state: r.state, cpu: next.cpu, memory: next.memory, storage: { usedGB: used, totalGB: total } });
    ops.push({ updateOne: { filter: { _id: r._id }, update: { $set: { ...next, status } } } });
  }
  if (samples.length) await Metric.insertMany(samples, { ordered: false });
  if (ops.length) await Resource.bulkWrite(ops);
  return samples.length;
}

/** Fills gaps in metric history (e.g. after the API was offline) at 5-minute resolution. */
export async function backfillMetrics(maxDays = 30): Promise<number> {
  const resources = await Resource.find().select('resourceId provider type state cpu memory network storage baseline createdAt').lean();
  const latest = await Metric.aggregate<{ _id: string; last: Date }>([{ $group: { _id: '$resourceId', last: { $max: '$timestamp' } } }]);
  const lastMap = new Map<string, Date>(latest.map((l) => [l._id, new Date(l.last)]));
  const now = new Date();
  let inserted = 0;
  for (const r of resources) {
    const last = lastMap.get(r.resourceId);
    const floor = new Date(now.getTime() - maxDays * 86_400_000);
    const from = last ?? new Date(Math.max(floor.getTime(), now.getTime() - 86_400_000));
    if (now.getTime() - from.getTime() < 10 * 60_000) continue;
    const start = new Date(Math.max(from.getTime() + 60_000, floor.getTime()));
    const gapHours = (now.getTime() - start.getTime()) / 3_600_000;
    const step = gapHours > 48 ? 60 : 5;
    const series = await getProvider(r.provider as Provider).getMetrics(toMetricContext(r), start, now, step);
    if (series.length) {
      await Metric.insertMany(series, { ordered: false });
      inserted += series.length;
    }
  }
  if (inserted) logger.info(`Backfilled ${inserted} metric samples`);
  return inserted;
}

let timer: NodeJS.Timeout | null = null;
let running = false;
let lastCycle: { at: Date; durationMs: number; samples: number; alerts: number } | null = null;

export function monitoringStatus() {
  return { enabled: Boolean(timer), intervalMs: env.simulationIntervalMs, lastCycle };
}

export async function runMonitoringCycle(): Promise<void> {
  if (running) return;
  running = true;
  const started = Date.now();
  try {
    const samples = await collectResourceMetrics();
    await refreshServiceHealth();
    await ensureCostsUpToDate();
    await invalidate(CacheKeys.dashboard, CacheKeys.resources, CacheKeys.monitoring, CacheKeys.serviceHealth, CacheKeys.providers, CacheKeys.costs);
    const alerts = await evaluateAlertRules();
    lastCycle = { at: new Date(), durationMs: Date.now() - started, samples, alerts };
    logger.debug(`Monitoring cycle: ${samples} samples, ${alerts} new alerts in ${lastCycle.durationMs} ms`);
  } catch (err) {
    logger.error('Monitoring cycle failed', err);
  } finally {
    running = false;
  }
}

export function startMonitoring(): void {
  if (timer) return;
  timer = setInterval(() => void runMonitoringCycle(), env.simulationIntervalMs);
  timer.unref();
  logger.info(`Monitoring loop started (every ${Math.round(env.simulationIntervalMs / 1000)}s)`);
}

export function stopMonitoring(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
