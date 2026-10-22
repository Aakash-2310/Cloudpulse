import { Types, type FilterQuery } from 'mongoose';
import { Alert, type IAlert } from '../models/Alert';
import { AlertRule, compare, type RuleOperator, type RuleMetric } from '../models/AlertRule';
import { Metric } from '../models/Metric';
import { Resource } from '../models/Resource';
import { ServiceHealth } from '../models/ServiceHealth';
import { PROVIDER_LABELS, type Provider } from '../models/types';
import { AppError, escapeRegex, round } from '../utils/http';
import { logger } from '../utils/logger';
import { CacheKeys, invalidate } from './redisService';
import { notify } from './notificationService';
import { detectAnomalies } from './costService';

const METRIC_TO_TYPE: Record<RuleMetric, IAlert['type']> = {
  cpu: 'high-cpu',
  memory: 'high-memory',
  disk: 'storage-capacity',
  network: 'high-network',
  'error-rate': 'resource-failure',
  'cost-increase': 'cost-spike',
  'service-availability': 'service-down',
};

const METRIC_LABEL: Record<RuleMetric, string> = {
  cpu: 'CPU',
  memory: 'Memory',
  disk: 'Disk',
  network: 'Network',
  'error-rate': 'Error rate',
  'cost-increase': 'Cost increase',
  'service-availability': 'Availability',
};

export interface AlertListQuery {
  status?: string;
  severity?: string;
  provider?: string;
  type?: string;
  search?: string;
  page: number;
  limit: number;
  skip: number;
}

export async function listAlerts(q: AlertListQuery) {
  const filter: FilterQuery<IAlert> = {};
  if (q.status && q.status !== 'all') {
    filter.status = q.status === 'active' ? { $in: ['open', 'acknowledged'] } : q.status;
  }
  if (q.severity && q.severity !== 'all') filter.severity = q.severity;
  if (q.provider && q.provider !== 'all') filter.provider = q.provider;
  if (q.type && q.type !== 'all') filter.type = q.type;
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), 'i');
    filter.$or = [{ title: rx }, { description: rx }, { resourceName: rx }];
  }
  const [items, total, counts] = await Promise.all([
    Alert.find(filter).sort({ createdAt: -1 }).skip(q.skip).limit(q.limit).lean(),
    Alert.countDocuments(filter),
    alertCounts(),
  ]);
  return { items, total, counts };
}

export async function alertCounts() {
  const rows = await Alert.aggregate<{ _id: { status: string; severity: string }; count: number }>([
    { $group: { _id: { status: '$status', severity: '$severity' }, count: { $sum: 1 } } },
  ]);
  const counts = { open: 0, acknowledged: 0, resolved: 0, critical: 0, warning: 0, info: 0, active: 0 };
  for (const r of rows) {
    counts[r._id.status as 'open'] += r.count;
    if (r._id.status !== 'resolved') {
      counts[r._id.severity as 'critical'] += r.count;
      counts.active += r.count;
    }
  }
  return counts;
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

/** Most relevant active alerts: critical first, then newest. */
export async function getRecentAlerts(limit = 6) {
  const active = await Alert.find({ status: { $in: ['open', 'acknowledged'] } })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  return active
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3) || +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, limit);
}

async function afterChange() {
  await invalidate(CacheKeys.alerts, CacheKeys.dashboard);
}

export async function createAlert(data: Partial<IAlert>) {
  const alert = await Alert.create(data);
  await notify({
    type: 'alert',
    title: `${alert.severity.toUpperCase()}: ${alert.title}`,
    message: alert.description,
    severity: alert.severity,
    link: `/alerts?focus=${String(alert._id)}`,
  });
  await afterChange();
  return alert;
}

export async function getAlert(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new AppError(400, 'Invalid alert id');
  const alert = await Alert.findById(id).lean();
  if (!alert) throw new AppError(404, 'Alert not found');
  return alert;
}

export async function updateAlert(id: string, data: Partial<IAlert>) {
  if (!Types.ObjectId.isValid(id)) throw new AppError(400, 'Invalid alert id');
  const alert = await Alert.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!alert) throw new AppError(404, 'Alert not found');
  await afterChange();
  return alert;
}

export async function deleteAlert(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new AppError(400, 'Invalid alert id');
  const alert = await Alert.findByIdAndDelete(id);
  if (!alert) throw new AppError(404, 'Alert not found');
  await afterChange();
}

export async function acknowledgeAlert(id: string, userId: string) {
  if (!Types.ObjectId.isValid(id)) throw new AppError(400, 'Invalid alert id');
  const alert = await Alert.findById(id);
  if (!alert) throw new AppError(404, 'Alert not found');
  if (alert.status === 'resolved') throw new AppError(409, 'Resolved alerts cannot be acknowledged');
  alert.status = 'acknowledged';
  alert.acknowledgedAt = new Date();
  alert.acknowledgedBy = new Types.ObjectId(userId);
  await alert.save();
  await afterChange();
  return alert;
}

export async function resolveAlert(id: string, userId: string) {
  if (!Types.ObjectId.isValid(id)) throw new AppError(400, 'Invalid alert id');
  const alert = await Alert.findById(id);
  if (!alert) throw new AppError(404, 'Alert not found');
  if (alert.status === 'resolved') return alert;
  alert.status = 'resolved';
  alert.resolvedAt = new Date();
  alert.resolvedBy = new Types.ObjectId(userId);
  await alert.save();
  await notify({
    type: 'alert-resolved',
    title: `Resolved: ${alert.title}`,
    message: alert.resourceName ? `${alert.resourceName} is back within thresholds.` : 'Alert resolved.',
    severity: 'success',
    link: `/alerts?focus=${String(alert._id)}`,
  });
  await afterChange();
  return alert;
}

/* ------------------------------------------------------------------ */
/* Rule evaluation                                                     */
/* ------------------------------------------------------------------ */

interface WindowStats {
  _id: string;
  samples: number;
  minCpu: number;
  maxCpu: number;
  minMem: number;
  maxMem: number;
  minDisk: number;
  maxDisk: number;
  minNet: number;
  maxNet: number;
  minErr: number;
  maxErr: number;
}

function pickValue(stats: WindowStats, metric: RuleMetric, operator: RuleOperator, capacity: number): number | null {
  // For ">" style rules the condition must hold for the whole window, so the minimum must exceed the threshold.
  const useMin = operator === '>' || operator === '>=' || operator === '==';
  switch (metric) {
    case 'cpu':
      return useMin ? stats.minCpu : stats.maxCpu;
    case 'memory':
      return useMin ? stats.minMem : stats.maxMem;
    case 'disk':
      return useMin ? stats.minDisk : stats.maxDisk;
    case 'error-rate':
      return useMin ? stats.minErr : stats.maxErr;
    case 'network':
      return capacity > 0 ? ((useMin ? stats.minNet : stats.maxNet) / capacity) * 100 : null;
    default:
      return null;
  }
}

/** Evaluates all enabled rules against current telemetry and opens alerts for new breaches. */
export async function evaluateAlertRules(): Promise<number> {
  const rules = await AlertRule.find({ enabled: true }).lean();
  if (!rules.length) return 0;
  let created = 0;

  const resources = await Resource.find({ state: 'running' })
    .select('name resourceId provider type networkCapacity storage')
    .lean();
  const resourceById = new Map<string, (typeof resources)[number]>(resources.map((r) => [r.resourceId, r]));

  const openKeys = new Set(
    (await Alert.find({ status: { $in: ['open', 'acknowledged'] }, rule: { $ne: null } }).select('resourceId rule title').lean()).map(
      (a) => `${a.resourceId ?? a.title}|${String(a.rule)}`,
    ),
  );

  for (const rule of rules) {
    const metric = rule.metric as RuleMetric;
    const operator = rule.operator as RuleOperator;
    const ruleKey = String(rule._id);

    if (metric === 'cost-increase') {
      const anomalies = (await detectAnomalies(rule.threshold)).filter((a) => a.type === 'week-over-week');
      for (const a of anomalies) {
        const resourceKey = `cost:${a.provider}:${a.service}`;
        if (openKeys.has(`${resourceKey}|${ruleKey}`)) continue;
        await createAlert({
          title: `${PROVIDER_LABELS[a.provider]} ${a.service} cost spike +${Math.round(a.differencePct)}%`,
          description: a.message,
          type: 'cost-spike',
          resourceId: resourceKey,
          resourceName: `${PROVIDER_LABELS[a.provider]} ${a.service}`,
          provider: a.provider,
          severity: rule.severity,
          rule: rule._id,
          ruleName: rule.name,
          metricValue: a.differencePct,
          threshold: rule.threshold,
        });
        openKeys.add(`${resourceKey}|${ruleKey}`);
        created += 1;
      }
      continue;
    }

    if (metric === 'service-availability') {
      const services = await ServiceHealth.find().lean();
      for (const svc of services) {
        const availability = svc.status === 'critical' ? 0 : 100;
        const resourceKey = `service:${svc.name}`;
        if (!compare(availability, operator, rule.threshold) || openKeys.has(`${resourceKey}|${ruleKey}`)) continue;
        await createAlert({
          title: `${svc.name} unavailable`,
          description: `${svc.name} health check failing: ${svc.errorRate}% errors, ${svc.responseTime} ms response time.`,
          type: 'service-down',
          resourceId: resourceKey,
          resourceName: svc.name,
          provider: (svc.provider as Provider | 'platform') ?? 'platform',
          severity: rule.severity,
          rule: rule._id,
          ruleName: rule.name,
          metricValue: availability,
          threshold: rule.threshold,
        });
        openKeys.add(`${resourceKey}|${ruleKey}`);
        created += 1;
      }
      continue;
    }

    const windowMinutes = Math.max(1, rule.duration ?? 5);
    const since = new Date(Date.now() - windowMinutes * 60_000);
    const stats = await Metric.aggregate<WindowStats>([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: '$resourceId',
          samples: { $sum: 1 },
          minCpu: { $min: '$cpu' },
          maxCpu: { $max: '$cpu' },
          minMem: { $min: '$memory' },
          maxMem: { $max: '$memory' },
          minDisk: { $min: '$diskUsage' },
          maxDisk: { $max: '$diskUsage' },
          minNet: { $min: { $add: ['$networkIn', '$networkOut'] } },
          maxNet: { $max: { $add: ['$networkIn', '$networkOut'] } },
          minErr: { $min: '$errorRate' },
          maxErr: { $max: '$errorRate' },
        },
      },
    ]);

    for (const s of stats) {
      const res = resourceById.get(s._id);
      if (!res) continue;
      if (metric === 'disk' && !res.storage?.totalGB) continue;
      if (metric === 'network' && !['load-balancer', 'virtual-network', 'kubernetes-cluster'].includes(res.type)) continue;
      const value = pickValue(s, metric, operator, res.networkCapacity ?? 0);
      if (value === null || !compare(value, operator, rule.threshold)) continue;
      const key = `${res.resourceId}|${ruleKey}`;
      if (openKeys.has(key)) continue;
      const label = METRIC_LABEL[metric];
      await createAlert({
        title: `${res.name} ${label} ${operator} ${rule.threshold}%`,
        description: `${label} on ${res.name} has been ${round(value, 1)}% for at least ${windowMinutes} minute(s) (rule "${rule.name}").`,
        type: METRIC_TO_TYPE[metric],
        resourceId: res.resourceId,
        resourceName: res.name,
        provider: res.provider as Provider,
        severity: rule.severity,
        rule: rule._id,
        ruleName: rule.name,
        metricValue: round(value, 1),
        threshold: rule.threshold,
      });
      openKeys.add(key);
      created += 1;
    }
  }

  if (created) {
    await touchRuleTriggers();
    logger.info(`Alert evaluation opened ${created} new alert(s)`);
  }
  return created;
}

/** Records when a rule last fired (called by the monitoring loop after evaluation). */
export async function touchRuleTriggers(): Promise<void> {
  const rows = await Alert.aggregate<{ _id: Types.ObjectId; count: number; last: Date }>([
    { $match: { rule: { $ne: null } } },
    { $group: { _id: '$rule', count: { $sum: 1 }, last: { $max: '$createdAt' } } },
  ]);
  if (!rows.length) return;
  await AlertRule.bulkWrite(
    rows.map((r) => ({
      updateOne: { filter: { _id: r._id }, update: { $set: { triggerCount: r.count, lastTriggeredAt: r.last } } },
    })),
  );
}
