import { Types } from 'mongoose';
import { User, type UserDocument } from '../models/User';
import { CloudAccount, type CloudAccountDocument } from '../models/CloudAccount';
import { Resource } from '../models/Resource';
import { Metric } from '../models/Metric';
import { Alert } from '../models/Alert';
import { AlertRule } from '../models/AlertRule';
import { CostRecord } from '../models/CostRecord';
import { ServiceHealth } from '../models/ServiceHealth';
import { Notification } from '../models/Notification';
import type { Environment, Provider } from '../models/types';
import { getPlatformProvider, getProvider } from '../providers';
import type { ServiceHealthSample } from '../providers/CloudProvider';
import { PROVIDER_REGIONS } from '../mock/mockCloudProvider';
import { DAY_MS, startOfUtcDay } from '../mock/random';
import { deriveStatus, toMetricContext } from './resourceHealth';
import { refreshServiceHealth } from './monitoringService';
import { touchRuleTriggers } from './alertService';
import { toAccountRef } from './cloudService';
import { invalidate, CacheKeys } from './redisService';
import { logger } from '../utils/logger';

const HOUR = 3_600_000;

const DEMO_USERS = [
  { name: 'Sujith Kumar', email: 'admin@cloudpulse.com', password: 'Admin@123', role: 'admin' as const, title: 'Cloud Platform Lead' },
  { name: 'Priya Nair', email: 'operator@cloudpulse.com', password: 'Operator@123', role: 'operator' as const, title: 'Site Reliability Engineer' },
  { name: 'Arjun Mehta', email: 'viewer@cloudpulse.com', password: 'Viewer@123', role: 'viewer' as const, title: 'FinOps Analyst' },
];

const DEMO_ACCOUNTS: Array<{ provider: Provider; accountName: string; accountId: string; environment: Environment; regions: string[] }> = [
  { provider: 'aws', accountName: 'acme-production', accountId: '482916305417', environment: 'production', regions: PROVIDER_REGIONS.aws },
  { provider: 'aws', accountName: 'acme-staging', accountId: '715203948861', environment: 'staging', regions: ['us-west-2', 'us-east-1'] },
  { provider: 'azure', accountName: 'acme-enterprise', accountId: 'b7c41e2a-9f3d-4c18-8e6a-2d5f0a71c934', environment: 'production', regions: PROVIDER_REGIONS.azure },
  { provider: 'gcp', accountName: 'acme-analytics', accountId: 'acme-analytics-prod', environment: 'production', regions: PROVIDER_REGIONS.gcp },
];

const DEFAULT_RULES = [
  { key: 'cpu', name: 'High CPU utilization', description: 'CPU above 80% for 5 minutes', metric: 'cpu', operator: '>', threshold: 80, duration: 5, severity: 'critical', enabled: true },
  { key: 'memory', name: 'High memory usage', description: 'Memory above 85% for 5 minutes', metric: 'memory', operator: '>', threshold: 85, duration: 5, severity: 'warning', enabled: true },
  { key: 'disk', name: 'Disk almost full', description: 'Disk / volume usage above 90%', metric: 'disk', operator: '>', threshold: 90, duration: 10, severity: 'critical', enabled: true },
  { key: 'network', name: 'Network saturation', description: 'Network throughput above 80% of provisioned bandwidth', metric: 'network', operator: '>', threshold: 80, duration: 5, severity: 'warning', enabled: true },
  { key: 'cost', name: 'Weekly cost increase', description: 'Service spend up more than 20% week over week', metric: 'cost-increase', operator: '>', threshold: 20, duration: 0, severity: 'warning', enabled: true },
  { key: 'service', name: 'Service unavailable', description: 'Health check reports the service as down', metric: 'service-availability', operator: '<', threshold: 50, duration: 1, severity: 'critical', enabled: true },
  { key: 'errors', name: 'Elevated error rate', description: 'Error rate above 5% for 5 minutes', metric: 'error-rate', operator: '>', threshold: 5, duration: 5, severity: 'warning', enabled: false },
] as const;

export async function isDatabaseEmpty(): Promise<boolean> {
  const [users, accounts] = await Promise.all([User.estimatedDocumentCount(), CloudAccount.estimatedDocumentCount()]);
  return users === 0 && accounts === 0;
}

async function insertInChunks<T>(model: { insertMany: (docs: T[], opts: { ordered: boolean }) => Promise<unknown> }, docs: T[], size = 5000) {
  for (let i = 0; i < docs.length; i += size) {
    await model.insertMany(docs.slice(i, i + size), { ordered: false });
  }
}

export async function seedDatabase(options: { reset?: boolean } = {}): Promise<Record<string, number>> {
  const started = Date.now();
  if (options.reset) {
    logger.info('Clearing existing data…');
    await Promise.all([
      User.deleteMany({}),
      CloudAccount.deleteMany({}),
      Resource.deleteMany({}),
      Metric.deleteMany({}),
      Alert.deleteMany({}),
      AlertRule.deleteMany({}),
      CostRecord.deleteMany({}),
      ServiceHealth.deleteMany({}),
      Notification.deleteMany({}),
    ]);
  }
  // Make sure indexes exist before bulk inserts.
  await Promise.all([Resource.syncIndexes(), Metric.syncIndexes(), Alert.syncIndexes(), CostRecord.syncIndexes(), CloudAccount.syncIndexes(), User.syncIndexes()]);

  /* Users ---------------------------------------------------------- */
  const users: UserDocument[] = [];
  for (const u of DEMO_USERS) users.push(await User.create(u));
  const admin = users[0];

  /* Accounts & resources ------------------------------------------ */
  const now = new Date();
  const accounts: CloudAccountDocument[] = [];
  let resourceCount = 0;
  for (const a of DEMO_ACCOUNTS) {
    const account = await CloudAccount.create({
      ...a,
      status: 'connected',
      lastSync: new Date(now.getTime() - (2 + Math.random() * 8) * 60_000),
      lastSyncDurationMs: 1800 + Math.round(Math.random() * 2400),
      createdBy: admin._id,
      createdAt: new Date(now.getTime() - 400 * DAY_MS),
    });
    accounts.push(account);
    const discovered = await getProvider(a.provider).getResources(toAccountRef(account));
    await Resource.insertMany(
      discovered.map((d) => ({ ...d, cloudAccountId: account._id, status: deriveStatus(d), lastSeenAt: now })),
      { ordered: false },
    );
    resourceCount += discovered.length;
  }
  logger.info(`Seeded ${accounts.length} cloud accounts and ${resourceCount} resources`);

  /* Metrics: hourly for 30 days, 5-minute for the last 24 hours ---- */
  const resources = await Resource.find().lean();
  let metricCount = 0;
  for (const r of resources) {
    const provider = getProvider(r.provider as Provider);
    const ctx = toMetricContext(r);
    const hourly = await provider.getMetrics(ctx, new Date(now.getTime() - 30 * DAY_MS), new Date(now.getTime() - 24 * HOUR - 1), 60);
    const recent = await provider.getMetrics(ctx, new Date(now.getTime() - 24 * HOUR), now, 5);
    const all = [...hourly, ...recent];
    await insertInChunks(Metric, all);
    metricCount += all.length;
    // Align the "current" values with the newest sample so tables and charts agree.
    const last = recent[recent.length - 1];
    if (last) {
      const used = r.storage?.totalGB ? (last.diskUsage / 100) * r.storage.totalGB : 0;
      const next = { cpu: last.cpu, memory: last.memory, network: Math.round((last.networkIn + last.networkOut) * 10) / 10 };
      await Resource.updateOne(
        { _id: r._id },
        { $set: { ...next, 'storage.usedGB': used || r.storage?.usedGB || 0, status: deriveStatus({ state: r.state, ...next, storage: { usedGB: used || r.storage?.usedGB, totalGB: r.storage?.totalGB } }) } },
      );
    }
  }
  logger.info(`Seeded ${metricCount} metric samples`);

  /* Costs: ~6 months of daily billing per account ----------------- */
  const yesterday = new Date(startOfUtcDay(now).getTime() - DAY_MS);
  const costFrom = new Date(yesterday.getTime() - 185 * DAY_MS);
  let costCount = 0;
  for (const account of accounts) {
    const costs = await getProvider(account.provider as Provider).getCosts(toAccountRef(account), costFrom, yesterday);
    await insertInChunks(CostRecord, costs.map((c) => ({ ...c, cloudAccountId: account._id })));
    costCount += costs.length;
  }
  logger.info(`Seeded ${costCount} cost records`);

  /* Alert rules ----------------------------------------------------- */
  const rules: Record<string, Types.ObjectId> = {};
  for (const { key, ...rule } of DEFAULT_RULES) {
    const doc = await AlertRule.create({ ...rule, createdBy: admin._id });
    rules[key] = doc._id;
  }

  /* Service health with ~2 hours of check history ------------------ */
  const platform = getPlatformProvider();
  const historyRuns: ServiceHealthSample[][] = [];
  for (let i = 0; i < 119; i += 1) historyRuns.push(await platform.getServiceHealth());
  const current = historyRuns[historyRuns.length - 1];
  await ServiceHealth.insertMany(
    current.map((svc) => {
      const history = historyRuns.map((run, i) => {
        const s = run.find((x) => x.name === svc.name)!;
        // Incidents started ~25 minutes ago; earlier checks were healthy.
        const status = i < historyRuns.length - 25 && s.status === 'critical' ? 'healthy' : s.status;
        return { timestamp: new Date(now.getTime() - (historyRuns.length - i) * 60_000), status, responseTime: s.responseTime };
      });
      return { ...svc, history, baselineResponseTime: svc.responseTime, lastChecked: now };
    }),
  );
  await refreshServiceHealth();

  /* Alerts ---------------------------------------------------------- */
  const byName = new Map<string, (typeof resources)[number]>(resources.map((r) => [r.name, r]));
  const res = (name: string) => {
    const r = byName.get(name);
    return r ? { resourceId: r.resourceId, resourceName: r.name, provider: r.provider } : { resourceName: name };
  };
  const ago = (hours: number) => new Date(now.getTime() - hours * HOUR);
  type SeedAlert = {
    title: string;
    description: string;
    type: string;
    severity: 'critical' | 'warning' | 'info';
    status: 'open' | 'acknowledged' | 'resolved';
    hours: number;
    rule?: keyof typeof rules;
    target: { resourceId?: string; resourceName: string; provider?: string };
    metricValue?: number;
    threshold?: number;
  };
  const seedAlerts: SeedAlert[] = [
    { title: 'payment-db-primary CPU > 80%', description: 'CPU on payment-db-primary reached 93.4% and has stayed above 80% for 12 minutes. Slow-query log shows a missing index on transactions.merchant_id.', type: 'high-cpu', severity: 'critical', status: 'open', hours: 0.4, rule: 'cpu', target: res('payment-db-primary'), metricValue: 93.4, threshold: 80 },
    { title: 'Payment Service unavailable', description: 'Health checks from 3 regions failing: 502 Bad Gateway from upstream card processor.', type: 'service-down', severity: 'critical', status: 'open', hours: 0.35, rule: 'service', target: { resourceId: 'service:Payment Service', resourceName: 'Payment Service', provider: 'platform' }, metricValue: 0, threshold: 50 },
    { title: 'ml-training-node-02 CPU > 80%', description: 'Sustained CPU above 80% during model training job #4821.', type: 'high-cpu', severity: 'critical', status: 'open', hours: 1.2, rule: 'cpu', target: res('ml-training-node-02'), metricValue: 89.6, threshold: 80 },
    { title: 'ml-training-node-01 CPU > 80%', description: 'Sustained CPU above 80% during model training job #4821.', type: 'high-cpu', severity: 'critical', status: 'acknowledged', hours: 3.1, rule: 'cpu', target: res('ml-training-node-01'), metricValue: 94.1, threshold: 80 },
    { title: 'Azure Storage capacity > 85%', description: 'blob-backups is 88% full (44.2 TB of 50 TB). At the current growth rate it reaches 95% in ~28 days.', type: 'storage-capacity', severity: 'warning', status: 'open', hours: 5, target: res('blob-backups'), metricValue: 88.4, threshold: 85 },
    { title: 'aks-platform-cluster memory > 85%', description: 'Node pool "system" memory pressure; 3 pods evicted in the last hour.', type: 'high-memory', severity: 'warning', status: 'acknowledged', hours: 7, rule: 'memory', target: res('aks-platform-cluster'), metricValue: 86.2, threshold: 85 },
    { title: 'AWS EC2 cost spike +34%', description: 'AWS EC2 spending increased by 34% compared with the previous week. New autoscaling group "api-burst" scaled out and did not scale in.', type: 'cost-spike', severity: 'warning', status: 'open', hours: 20, rule: 'cost', target: { resourceId: 'cost:aws:EC2', resourceName: 'AWS EC2', provider: 'aws' }, metricValue: 34, threshold: 20 },
    { title: 'API Gateway p95 latency above 750 ms', description: 'Edge latency degraded after config deploy #212. Error rate 3.1%.', type: 'resource-failure', severity: 'warning', status: 'open', hours: 2, target: { resourceId: 'service:API Gateway', resourceName: 'API Gateway', provider: 'platform' }, metricValue: 812, threshold: 750 },
    { title: 'logs-archive storage capacity > 80%', description: 'Archive bucket is 84% of its quota. Review the 7-year retention policy.', type: 'storage-capacity', severity: 'warning', status: 'open', hours: 30, target: res('logs-archive'), metricValue: 84, threshold: 80 },
    { title: 'Azure Blob Storage spend +18% this month', description: 'Blob Storage month-to-date spend is 18% higher than the same period last month after backup retention was extended to 90 days.', type: 'cost-spike', severity: 'info', status: 'open', hours: 48, target: { resourceId: 'cost:azure:Blob Storage', resourceName: 'Azure Blob Storage', provider: 'azure' } },
    { title: 'New AWS instance detected', description: 'prod-api-server-04 (m6i.xlarge) was discovered in eu-west-1 during account sync.', type: 'resource-created', severity: 'info', status: 'open', hours: 6 * 24 - 2, target: res('prod-api-server-04') },
    { title: 'GCP BigQuery daily spend spike', description: 'BigQuery on-demand analysis cost was 2.8× the 14-day average. Unpartitioned full-table scans from a Looker dashboard.', type: 'cost-spike', severity: 'critical', status: 'acknowledged', hours: 70, target: { resourceId: 'cost-day:gcp:BigQuery', resourceName: 'GCP BigQuery', provider: 'gcp' }, metricValue: 180, threshold: 50 },
    { title: 'crm-sql-primary DTU > 90%', description: 'Azure SQL DTU consumption peaked at 96% during nightly ETL.', type: 'high-cpu', severity: 'warning', status: 'resolved', hours: 26, target: res('crm-sql-primary'), metricValue: 96, threshold: 90 },
    { title: 'web-load-balancer 5xx rate > 5%', description: 'Target group health checks failed for 2 of 4 targets during deploy.', type: 'resource-failure', severity: 'critical', status: 'resolved', hours: 50, target: res('web-load-balancer'), metricValue: 7.4, threshold: 5 },
    { title: 'prod-api-server-01 CPU > 80%', description: 'Traffic surge from marketing campaign; autoscaling added capacity.', type: 'high-cpu', severity: 'critical', status: 'resolved', hours: 74, rule: 'cpu', target: res('prod-api-server-01'), metricValue: 87.2, threshold: 80 },
    { title: 'checkout-service restart loop', description: 'Container restarted 14 times in 10 minutes (OOMKilled). Memory limit raised to 4 GiB.', type: 'resource-failure', severity: 'critical', status: 'resolved', hours: 98, target: res('checkout-service') },
    { title: 'Redis latency spike', description: 'p99 command latency 180 ms during key eviction storm.', type: 'resource-failure', severity: 'warning', status: 'resolved', hours: 101, target: { resourceId: 'service:Redis', resourceName: 'Redis', provider: 'platform' } },
    { title: 'etl-runner-vm memory > 85%', description: 'Memory pressure during the monthly backfill job.', type: 'high-memory', severity: 'warning', status: 'resolved', hours: 122, rule: 'memory', target: res('etl-runner-vm'), metricValue: 88.9, threshold: 85 },
    { title: 'Notification Service error rate elevated', description: 'SMS provider returned throttling errors (HTTP 429).', type: 'resource-failure', severity: 'warning', status: 'resolved', hours: 146, target: { resourceId: 'service:Notification Service', resourceName: 'Notification Service', provider: 'platform' } },
    { title: 'Azure SQL failover completed', description: 'Planned maintenance failover for crm-sql-primary completed in 34 s.', type: 'resource-failure', severity: 'info', status: 'resolved', hours: 192, target: res('crm-sql-primary') },
    { title: 'hub-vnet network > 80%', description: 'ExpressRoute gateway saturated during backup window.', type: 'high-network', severity: 'warning', status: 'resolved', hours: 216, rule: 'network', target: res('hub-vnet'), metricValue: 83.5, threshold: 80 },
    { title: 'catalog-cosmos request throttling', description: '4.2% of requests returned 429 (RU/s exhausted). Autoscale max raised to 12,000 RU/s.', type: 'resource-failure', severity: 'warning', status: 'resolved', hours: 240, target: res('catalog-cosmos') },
    { title: 'staging-db CPU > 80%', description: 'Load test against staging exceeded the instance class.', type: 'high-cpu', severity: 'critical', status: 'resolved', hours: 264, rule: 'cpu', target: res('staging-db'), metricValue: 91.3, threshold: 80 },
    { title: 'New GCP resources detected', description: 'ml-training-node-01 and ml-training-node-02 (a2-highgpu-1g) were created in us-central1.', type: 'resource-created', severity: 'info', status: 'resolved', hours: 288, target: res('ml-training-node-01') },
    { title: 'dev-sandbox-vm stopped', description: 'Auto-shutdown policy stopped the development VM outside business hours.', type: 'resource-failure', severity: 'info', status: 'resolved', hours: 312, target: res('dev-sandbox-vm') },
  ];
  const alertDocs = seedAlerts.map((a) => {
    const createdAt = ago(a.hours);
    const ack = a.status !== 'open' ? new Date(createdAt.getTime() + 12 * 60_000) : undefined;
    const resolved = a.status === 'resolved' ? new Date(createdAt.getTime() + (0.5 + Math.random() * 3) * HOUR) : undefined;
    const rule = a.rule ? DEFAULT_RULES.find((r) => r.key === a.rule) : undefined;
    return {
      title: a.title,
      description: a.description,
      type: a.type,
      severity: a.severity,
      status: a.status,
      ...a.target,
      provider: a.target.provider ?? 'platform',
      rule: a.rule ? rules[a.rule] : undefined,
      ruleName: rule?.name,
      metricValue: a.metricValue,
      threshold: a.threshold,
      acknowledgedAt: ack,
      acknowledgedBy: ack ? users[1]._id : undefined,
      resolvedAt: resolved,
      resolvedBy: resolved ? users[1]._id : undefined,
      createdAt,
      updatedAt: resolved ?? ack ?? createdAt,
    };
  });
  await Alert.insertMany(alertDocs);
  await touchRuleTriggers();

  /* Notifications --------------------------------------------------- */
  const notes = [
    { type: 'alert', title: 'CRITICAL: payment-db-primary CPU > 80%', message: 'CPU reached 93.4% on payment-db-primary.', severity: 'critical', link: '/alerts', createdAt: ago(0.4) },
    { type: 'alert', title: 'CRITICAL: Payment Service unavailable', message: '502 Bad Gateway from upstream card processor.', severity: 'critical', link: '/service-health', createdAt: ago(0.35) },
    { type: 'alert', title: 'CRITICAL: ml-training-node-02 CPU > 80%', message: 'Sustained CPU during training job #4821.', severity: 'critical', link: '/alerts', createdAt: ago(1.2) },
    { type: 'alert', title: 'WARNING: API Gateway p95 latency above 750 ms', message: 'Latency degraded after config deploy #212.', severity: 'warning', link: '/service-health', createdAt: ago(2) },
    { type: 'alert', title: 'WARNING: Azure Storage capacity > 85%', message: 'blob-backups is 88% full.', severity: 'warning', link: '/storage', createdAt: ago(5) },
    { type: 'cost-anomaly', title: 'Cost anomaly: AWS EC2 +34%', message: 'AWS EC2 spending increased by 34% compared with the previous week.', severity: 'warning', link: '/costs/anomalies', createdAt: ago(20) },
    { type: 'alert-resolved', title: 'Resolved: crm-sql-primary DTU > 90%', message: 'crm-sql-primary is back within thresholds.', severity: 'success', link: '/alerts', createdAt: ago(24) },
    { type: 'connection-failure', title: 'Sync failed: acme-enterprise', message: 'Azure AD token expired (AADSTS700082). Automatic retry succeeded 4 minutes later.', severity: 'critical', link: '/accounts', createdAt: ago(31) },
    { type: 'cost-anomaly', title: 'Cost anomaly: GCP BigQuery daily spike', message: 'BigQuery spend was 2.8× the 14-day average.', severity: 'critical', link: '/costs/anomalies', createdAt: ago(70) },
    { type: 'system', title: 'Weekly operations report ready', message: 'Infrastructure summary for last week is available for export.', severity: 'info', link: '/settings', createdAt: ago(96) },
    { type: 'system', title: 'Alert rules updated', message: 'Sujith Kumar disabled "Elevated error rate".', severity: 'info', link: '/alert-rules', createdAt: ago(150) },
  ];
  // Older notifications start out read for everyone.
  await Notification.insertMany(
    notes.map((n) => ({ ...n, updatedAt: n.createdAt, readBy: n.createdAt < ago(30) ? users.map((u) => u._id) : [] })),
  );

  await invalidate(...Object.values(CacheKeys));

  const summary = {
    users: users.length,
    cloudAccounts: accounts.length,
    resources: resourceCount,
    metrics: metricCount,
    costRecords: costCount,
    alertRules: DEFAULT_RULES.length,
    alerts: alertDocs.length,
    services: await ServiceHealth.countDocuments(),
    notifications: notes.length,
    durationMs: Date.now() - started,
  };
  logger.info('Seed complete', summary);
  return summary;
}
