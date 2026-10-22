import { Types } from 'mongoose';
import { CloudAccount, type CloudAccountDocument } from '../models/CloudAccount';
import { Resource } from '../models/Resource';
import { Metric } from '../models/Metric';
import { CostRecord } from '../models/CostRecord';
import { Alert } from '../models/Alert';
import { PROVIDER_LABELS, type Environment, type HealthStatus, type Provider } from '../models/types';
import { getProvider } from '../providers';
import type { AccountRef, ConnectionInput } from '../providers/CloudProvider';
import { ProviderNotConfiguredError } from '../providers/CloudProvider';
import { AppError, latestDate, round } from '../utils/http';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { DAY_MS, startOfUtcDay } from '../mock/random';
import { CacheKeys, buildKey, cached, invalidate } from './redisService';
import { notify } from './notificationService';
import { deriveStatus, toMetricContext } from './resourceHealth';

const COST_HISTORY_DAYS = 185;

export function toAccountRef(a: { _id: unknown; provider: string; accountId: string; accountName: string; environment?: string | null; regions?: string[] | null }): AccountRef {
  return {
    id: String(a._id),
    provider: a.provider as Provider,
    accountId: a.accountId,
    accountName: a.accountName,
    environment: a.environment ?? 'production',
    regions: a.regions ?? [],
  };
}

async function invalidateCloudCaches() {
  await invalidate(CacheKeys.providers, CacheKeys.dashboard, CacheKeys.resources, CacheKeys.monitoring, CacheKeys.costs, CacheKeys.alerts);
}

/** Accounts with live resource counts, 30-day cost and rolled-up health. */
export async function listAccounts(provider?: string) {
  return cached(buildKey(CacheKeys.providers, { view: 'accounts', provider }), env.cacheTtl.providers, async () => {
    const filter = provider && provider !== 'all' ? { provider } : {};
    const accounts = await CloudAccount.find(filter).sort({ provider: 1, accountName: 1 }).lean();
    const since = new Date(startOfUtcDay(new Date()).getTime() - 30 * DAY_MS);
    const [resourceRows, costRows] = await Promise.all([
      Resource.aggregate<{ _id: { a: Types.ObjectId; s: HealthStatus }; count: number }>([
        { $group: { _id: { a: '$cloudAccountId', s: '$status' }, count: { $sum: 1 } } },
      ]),
      CostRecord.aggregate<{ _id: Types.ObjectId; amount: number }>([
        { $match: { date: { $gte: since } } },
        { $group: { _id: '$cloudAccountId', amount: { $sum: '$amount' } } },
      ]),
    ]);
    return accounts.map((a) => {
      const id = String(a._id);
      const counts = { healthy: 0, warning: 0, critical: 0, unknown: 0 };
      resourceRows.filter((r) => String(r._id.a) === id).forEach((r) => (counts[r._id.s] = r.count));
      const resources = counts.healthy + counts.warning + counts.critical + counts.unknown;
      let health: HealthStatus = resources ? 'healthy' : 'unknown';
      if (a.status === 'error' || counts.critical > Math.max(1, resources * 0.1)) health = 'critical';
      else if (counts.critical > 0 || counts.warning > resources * 0.15) health = 'warning';
      return {
        ...a,
        resourceCount: resources,
        healthCounts: counts,
        health,
        monthlyCost: round(costRows.find((c) => String(c._id) === id)?.amount ?? 0),
      };
    });
  });
}

/** One card per provider (AWS / Azure / GCP) aggregating all of its accounts. */
export async function getProvidersOverview() {
  return cached(buildKey(CacheKeys.providers, { view: 'overview' }), env.cacheTtl.providers, async () => {
    const accounts = await listAccounts();
    const providers: Provider[] = ['aws', 'azure', 'gcp'];
    return providers.map((p) => {
      const accs = accounts.filter((a) => a.provider === p);
      const healths = accs.map((a) => a.health);
      const health: HealthStatus = !accs.length
        ? 'unknown'
        : healths.includes('critical')
          ? 'critical'
          : healths.includes('warning')
            ? 'warning'
            : 'healthy';
      const status = !accs.length
        ? 'not-connected'
        : accs.some((a) => a.status === 'error')
          ? 'error'
          : accs.some((a) => a.status === 'syncing')
            ? 'syncing'
            : 'connected';
      return {
        provider: p,
        label: PROVIDER_LABELS[p],
        status,
        health,
        accounts: accs.map((a) => ({ _id: a._id, accountName: a.accountName, accountId: a.accountId, status: a.status, environment: a.environment })),
        accountName: accs[0]?.accountName ?? null,
        regionCount: new Set(accs.flatMap((a) => a.regions ?? [])).size,
        resourceCount: accs.reduce((s, a) => s + a.resourceCount, 0),
        monthlyCost: round(accs.reduce((s, a) => s + a.monthlyCost, 0)),
        lastSync: latestDate(accs.map((a) => a.lastSync)),
      };
    });
  });
}

export async function getAccount(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new AppError(400, 'Invalid account id');
  const all = await listAccounts();
  const account = all.find((a) => String(a._id) === id);
  if (!account) throw new AppError(404, 'Cloud account not found');
  return account;
}

export async function validateConnection(input: ConnectionInput) {
  try {
    return await getProvider(input.provider).validateConnection(input);
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) throw new AppError(501, err.message);
    throw err;
  }
}

/** Generates (or tops up) daily cost records for an account up to yesterday. */
async function syncAccountCosts(account: AccountRef): Promise<number> {
  const yesterday = new Date(startOfUtcDay(new Date()).getTime() - DAY_MS);
  const latest = await CostRecord.findOne({ cloudAccountId: account.id }).sort({ date: -1 }).select('date').lean();
  const from = latest ? new Date(startOfUtcDay(latest.date).getTime() + DAY_MS) : new Date(yesterday.getTime() - COST_HISTORY_DAYS * DAY_MS);
  if (from > yesterday) return 0;
  const costs = await getProvider(account.provider).getCosts(account, from, yesterday);
  if (!costs.length) return 0;
  await CostRecord.insertMany(costs.map((c) => ({ ...c, cloudAccountId: new Types.ObjectId(account.id) })), { ordered: false });
  return costs.length;
}

let lastCostCheck = 0;

/** Called by the monitoring loop: ensures every connected account has billing data through yesterday. */
export async function ensureCostsUpToDate(force = false): Promise<void> {
  if (!force && Date.now() - lastCostCheck < 15 * 60_000) return;
  lastCostCheck = Date.now();
  const accounts = await CloudAccount.find({ status: { $in: ['connected', 'syncing'] } }).lean();
  let inserted = 0;
  for (const a of accounts) {
    try {
      inserted += await syncAccountCosts(toAccountRef(a));
    } catch (err) {
      logger.warn(`Cost sync failed for ${a.accountName}`, (err as Error).message);
    }
  }
  if (inserted) {
    logger.info(`Added ${inserted} cost records`);
    await invalidate(CacheKeys.costs, CacheKeys.dashboard);
  }
}

export interface SyncResult {
  discovered: number;
  added: number;
  updated: number;
  removed: number;
  costRecords: number;
  durationMs: number;
}

/** Discovers resources through the provider adapter and reconciles them with MongoDB. */
export async function syncAccount(account: CloudAccountDocument, options: { initial?: boolean } = {}): Promise<SyncResult> {
  const started = Date.now();
  account.status = 'syncing';
  await account.save();
  const ref = toAccountRef(account);
  try {
    const provider = getProvider(ref.provider);
    const discovered = await provider.getResources(ref);
    const existing = await Resource.find({ cloudAccountId: account._id }).select('resourceId').lean();
    const existingIds = new Set<string>(existing.map((e) => e.resourceId));
    const discoveredIds = new Set<string>(discovered.map((d) => d.resourceId));

    const ops: Parameters<typeof Resource.bulkWrite>[0] = discovered.map((d) => {
      const isNew = !existingIds.has(d.resourceId);
      const inventory = {
        name: d.name,
        provider: d.provider,
        cloudAccountId: account._id,
        type: d.type,
        service: d.service,
        sku: d.sku,
        region: d.region,
        environment: d.environment,
        state: d.state,
        networkCapacity: d.networkCapacity,
        'storage.totalGB': d.storage.totalGB,
        cost: d.cost,
        tags: d.tags,
        baseline: d.baseline,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      };
      // Live utilisation fields are owned by the monitoring loop; only set them for new resources.
      const live = isNew
        ? {
            cpu: d.cpu,
            memory: d.memory,
            network: d.network,
            'storage.usedGB': d.storage.usedGB,
            status: deriveStatus(d),
            createdAt: d.createdAt,
          }
        : {};
      return {
        updateOne: {
          filter: { resourceId: d.resourceId },
          update: { $set: { ...inventory, ...live } },
          upsert: true,
          timestamps: false,
        },
      };
    });
    if (ops.length) await Resource.bulkWrite(ops);

    const removedIds = [...existingIds].filter((id) => !discoveredIds.has(id));
    if (removedIds.length) {
      await Resource.deleteMany({ resourceId: { $in: removedIds } });
      await Metric.deleteMany({ resourceId: { $in: removedIds } });
    }

    const added = discovered.filter((d) => !existingIds.has(d.resourceId));
    // Give new resources 24h of history so detail charts are immediately useful.
    for (const d of added) {
      const now = new Date();
      const series = await provider.getMetrics(toMetricContext(d), new Date(now.getTime() - DAY_MS), now, 5);
      if (series.length) await Metric.insertMany(series, { ordered: false });
    }
    if (!options.initial && added.length) {
      for (const d of added.slice(0, 5)) {
        await Alert.create({
          title: `New ${PROVIDER_LABELS[d.provider]} ${d.service} resource detected`,
          description: `${d.name} (${d.sku}) was discovered in ${d.region} during account sync.`,
          type: 'resource-created',
          resourceId: d.resourceId,
          resourceName: d.name,
          provider: d.provider,
          severity: 'info',
        });
      }
    }

    const costRecords = await syncAccountCosts(ref);
    account.status = 'connected';
    account.lastSync = new Date();
    account.lastSyncDurationMs = Date.now() - started;
    account.lastError = undefined;
    account.set('regions', Array.from(new Set([...(account.regions ?? []), ...discovered.map((d) => d.region)])));
    await account.save();
    await invalidateCloudCaches();
    return {
      discovered: discovered.length,
      added: added.length,
      updated: discovered.length - added.length,
      removed: removedIds.length,
      costRecords,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    account.status = 'error';
    account.lastError = (err as Error).message;
    await account.save();
    await notify({
      type: 'connection-failure',
      title: `Sync failed: ${account.accountName}`,
      message: (err as Error).message,
      severity: 'critical',
      link: '/accounts',
    });
    await invalidateCloudCaches();
    if (err instanceof ProviderNotConfiguredError) throw new AppError(501, err.message);
    throw new AppError(502, `Synchronization failed: ${(err as Error).message}`);
  }
}

export async function createAccount(
  input: { provider: Provider; accountName: string; accountId: string; environment: Environment; credentials: Record<string, string> },
  userId: string,
) {
  const exists = await CloudAccount.exists({ provider: input.provider, accountId: input.accountId });
  if (exists) throw new AppError(409, `${PROVIDER_LABELS[input.provider]} account ${input.accountId} is already connected`);

  const validation = await validateConnection(input);
  if (!validation.ok) throw new AppError(400, validation.message);

  // Credentials are used for validation only and are never persisted or returned.
  const account = await CloudAccount.create({
    provider: input.provider,
    accountName: input.accountName,
    accountId: input.accountId,
    environment: input.environment,
    regions: validation.regions,
    status: 'syncing',
    createdBy: new Types.ObjectId(userId),
  });
  const sync = await syncAccount(account, { initial: true });
  await notify({
    type: 'system',
    title: `${PROVIDER_LABELS[input.provider]} account connected`,
    message: `${input.accountName} synchronized ${sync.discovered} resources across ${account.regions.length} regions.`,
    severity: 'success',
    link: '/providers',
  });
  return { account: account.toJSON(), sync, validation };
}

export async function updateAccount(id: string, data: { accountName?: string; environment?: string; status?: 'connected' | 'disconnected' }) {
  if (!Types.ObjectId.isValid(id)) throw new AppError(400, 'Invalid account id');
  const account = await CloudAccount.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!account) throw new AppError(404, 'Cloud account not found');
  await invalidateCloudCaches();
  return account;
}

export async function deleteAccount(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new AppError(400, 'Invalid account id');
  const account = await CloudAccount.findById(id);
  if (!account) throw new AppError(404, 'Cloud account not found');
  const resourceIds = (await Resource.find({ cloudAccountId: account._id }).select('resourceId').lean()).map((r) => r.resourceId);
  await Promise.all([
    Resource.deleteMany({ cloudAccountId: account._id }),
    Metric.deleteMany({ resourceId: { $in: resourceIds } }),
    CostRecord.deleteMany({ cloudAccountId: account._id }),
    Alert.deleteMany({ resourceId: { $in: resourceIds } }),
  ]);
  await account.deleteOne();
  await notify({
    type: 'system',
    title: `${PROVIDER_LABELS[account.provider as Provider]} account removed`,
    message: `${account.accountName} and ${resourceIds.length} resources were removed from monitoring.`,
    severity: 'info',
    link: '/accounts',
  });
  await invalidateCloudCaches();
  return { removedResources: resourceIds.length };
}

export async function syncAccountById(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new AppError(400, 'Invalid account id');
  const account = await CloudAccount.findById(id);
  if (!account) throw new AppError(404, 'Cloud account not found');
  if (account.status === 'disconnected') throw new AppError(409, 'Reconnect the account before synchronizing');
  return syncAccount(account);
}
