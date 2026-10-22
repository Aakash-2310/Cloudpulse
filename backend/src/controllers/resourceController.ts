import type { Request, Response } from 'express';
import { Types, type FilterQuery } from 'mongoose';
import { z } from 'zod';
import { Resource, type IResource } from '../models/Resource';
import { CloudAccount } from '../models/CloudAccount';
import { Alert } from '../models/Alert';
import { Metric } from '../models/Metric';
import { ENVIRONMENTS, HEALTH_STATUSES, PROVIDERS, RESOURCE_TYPES } from '../models/types';
import { AppError, asyncHandler, escapeRegex, parsePagination, sendSuccess } from '../utils/http';
import { CacheKeys, buildKey, cached, invalidate } from '../services/redisService';
import { deriveStatus, getResourceMetrics } from '../services/monitoringService';
import { env } from '../config/env';

const SORTABLE = ['name', 'provider', 'type', 'region', 'status', 'cpu', 'memory', 'network', 'cost', 'updatedAt', 'createdAt'] as const;

export const resourceSchema = z.object({
  name: z.string().trim().min(2).max(120).regex(/^[a-zA-Z0-9._-]+$/, 'Use letters, numbers, dots, dashes and underscores'),
  resourceId: z.string().trim().min(3).max(300).optional(),
  provider: z.enum(PROVIDERS),
  cloudAccountId: z.string().refine((v) => Types.ObjectId.isValid(v), 'Invalid cloud account id'),
  type: z.enum(RESOURCE_TYPES),
  service: z.string().trim().min(1).max(60),
  sku: z.string().trim().max(80).optional(),
  region: z.string().trim().min(2).max(40),
  environment: z.enum(ENVIRONMENTS).default('production'),
  state: z.enum(['running', 'stopped', 'provisioning']).default('running'),
  cost: z.coerce.number().min(0).max(1_000_000).default(0),
  networkCapacity: z.coerce.number().min(0).max(1_000_000).optional(),
  storage: z.object({ usedGB: z.coerce.number().min(0), totalGB: z.coerce.number().min(0) }).optional(),
  tags: z.record(z.string().max(60)).optional(),
});

export const resourceUpdateSchema = resourceSchema
  .omit({ provider: true, cloudAccountId: true, resourceId: true })
  .partial();

export function buildResourceFilter(q: Record<string, unknown>): FilterQuery<IResource> {
  const filter: FilterQuery<IResource> = {};
  const one = (key: string) => (typeof q[key] === 'string' && q[key] !== '' && q[key] !== 'all' ? String(q[key]) : undefined);
  const provider = one('provider');
  const status = one('status');
  const type = one('type');
  const region = one('region');
  const environment = one('environment');
  const search = one('search');
  const accountId = one('accountId');
  if (provider) filter.provider = { $in: provider.split(',') };
  if (status) filter.status = { $in: status.split(',') };
  if (type) filter.type = { $in: type.split(',') };
  if (region) filter.region = { $in: region.split(',') };
  if (environment) filter.environment = environment;
  if (accountId && Types.ObjectId.isValid(accountId)) filter.cloudAccountId = new Types.ObjectId(accountId);
  if (search) {
    const rx = new RegExp(escapeRegex(search.slice(0, 100)), 'i');
    filter.$or = [{ name: rx }, { resourceId: rx }, { service: rx }, { sku: rx }];
  }
  return filter;
}

export const listResources = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query, 20, 100);
  const sortField = SORTABLE.includes(req.query.sort as (typeof SORTABLE)[number]) ? String(req.query.sort) : 'name';
  const order = req.query.order === 'desc' ? -1 : 1;
  const filter = buildResourceFilter(req.query as Record<string, unknown>);
  const key = buildKey(CacheKeys.resources, { view: 'list', ...(req.query as Record<string, unknown>), page, limit, sortField, order });

  const result = await cached(key, env.cacheTtl.resources, async () => {
    const [items, total, facets] = await Promise.all([
      Resource.find(filter)
        .sort({ [sortField]: order, _id: 1 })
        .skip(skip)
        .limit(limit)
        .populate('cloudAccountId', 'accountName provider')
        .lean(),
      Resource.countDocuments(filter),
      Resource.aggregate<{ regions: string[]; services: string[] }>([
        { $group: { _id: null, regions: { $addToSet: '$region' }, services: { $addToSet: '$service' } } },
      ]),
    ]);
    return {
      items: items.map((r) => ({ ...r, baseline: undefined })),
      total,
      facets: {
        regions: (facets[0]?.regions ?? []).sort(),
        services: (facets[0]?.services ?? []).sort(),
        providers: PROVIDERS,
        types: RESOURCE_TYPES,
        statuses: HEALTH_STATUSES,
        environments: ENVIRONMENTS,
      },
    };
  });

  return sendSuccess(res, { items: result.items, facets: result.facets }, 'Request successful', 200, {
    page,
    limit,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / limit)),
  });
});

async function findResource(id: string) {
  const query = Types.ObjectId.isValid(id) ? { _id: id } : { resourceId: id };
  const resource = await Resource.findOne(query).populate('cloudAccountId', 'accountName accountId provider environment').lean();
  if (!resource) throw new AppError(404, 'Resource not found');
  return resource;
}

export const getResource = asyncHandler(async (req: Request, res: Response) => {
  const resource = await findResource(req.params.id);
  const alerts = await Alert.find({ resourceId: resource.resourceId }).sort({ createdAt: -1 }).limit(10).lean();
  const { baseline: _baseline, ...rest } = resource;
  return sendSuccess(res, { resource: rest, alerts });
});

export const getResourceMetricsHandler = asyncHandler(async (req: Request, res: Response) => {
  const resource = await findResource(req.params.id);
  const data = await getResourceMetrics(resource.resourceId, req.query.range);
  return sendSuccess(res, data);
});

export const createResource = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof resourceSchema>;
  const account = await CloudAccount.findById(body.cloudAccountId).lean();
  if (!account) throw new AppError(400, 'Cloud account not found');
  if (account.provider !== body.provider) throw new AppError(400, `Account ${account.accountName} belongs to ${account.provider.toUpperCase()}`);
  const resourceId = body.resourceId ?? `manual/${body.provider}/${body.region}/${body.name}`;
  const storage = body.storage ?? { usedGB: 0, totalGB: 0 };
  const resource = await Resource.create({
    ...body,
    resourceId,
    storage,
    cpu: 0,
    memory: 0,
    network: 0,
    baseline: { cpu: 25, memory: 40, network: 20 },
    status: body.state === 'stopped' ? 'unknown' : 'healthy',
  });
  await invalidate(CacheKeys.resources, CacheKeys.dashboard, CacheKeys.monitoring, CacheKeys.providers);
  return sendSuccess(res, { resource }, 'Resource registered', 201);
});

export const updateResource = asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) throw new AppError(400, 'Invalid resource id');
  const body = req.body as z.infer<typeof resourceUpdateSchema>;
  const resource = await Resource.findById(req.params.id);
  if (!resource) throw new AppError(404, 'Resource not found');
  resource.set(body);
  resource.status = deriveStatus(resource);
  await resource.save();
  await invalidate(CacheKeys.resources, CacheKeys.dashboard, CacheKeys.monitoring, CacheKeys.providers);
  return sendSuccess(res, { resource }, 'Resource updated');
});

export const deleteResource = asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) throw new AppError(400, 'Invalid resource id');
  const resource = await Resource.findByIdAndDelete(req.params.id);
  if (!resource) throw new AppError(404, 'Resource not found');
  await Metric.deleteMany({ resourceId: resource.resourceId });
  await invalidate(CacheKeys.resources, CacheKeys.dashboard, CacheKeys.monitoring, CacheKeys.providers);
  return sendSuccess(res, null, 'Resource removed from monitoring');
});
