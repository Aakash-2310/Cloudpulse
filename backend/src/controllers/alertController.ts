import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { ALERT_STATUSES, ALERT_TYPES } from '../models/Alert';
import { AlertRule, RULE_METRICS, RULE_OPERATORS } from '../models/AlertRule';
import { PROVIDERS, SEVERITIES } from '../models/types';
import { AppError, asyncHandler, parsePagination, sendSuccess } from '../utils/http';
import * as alertService from '../services/alertService';
import { CacheKeys, invalidate } from '../services/redisService';

export const createAlertSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(1000).default(''),
  type: z.enum(ALERT_TYPES).default('resource-failure'),
  resourceId: z.string().trim().max(300).optional(),
  resourceName: z.string().trim().max(120).optional(),
  provider: z.enum([...PROVIDERS, 'platform']).default('platform'),
  severity: z.enum(SEVERITIES),
});

export const updateAlertSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().max(1000),
    severity: z.enum(SEVERITIES),
    status: z.enum(ALERT_STATUSES),
  })
  .partial();

export const listAlerts = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query, 20, 100);
  const q = req.query as Record<string, string | undefined>;
  const { items, total, counts } = await alertService.listAlerts({
    status: q.status,
    severity: q.severity,
    provider: q.provider,
    type: q.type,
    search: q.search,
    page,
    limit,
    skip,
  });
  return sendSuccess(res, { items, counts }, 'Request successful', 200, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

export const getAlert = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, await alertService.getAlert(req.params.id)));

export const createAlert = asyncHandler(async (req: Request, res: Response) => {
  const alert = await alertService.createAlert(req.body as z.infer<typeof createAlertSchema>);
  return sendSuccess(res, alert, 'Alert created', 201);
});

export const updateAlert = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof updateAlertSchema>;
  if (body.status === 'resolved') {
    return sendSuccess(res, await alertService.resolveAlert(req.params.id, req.user!.id), 'Alert resolved');
  }
  if (body.status === 'acknowledged') {
    await alertService.acknowledgeAlert(req.params.id, req.user!.id);
    const { status: _status, ...rest } = body;
    return sendSuccess(res, await alertService.updateAlert(req.params.id, rest), 'Alert updated');
  }
  return sendSuccess(res, await alertService.updateAlert(req.params.id, body), 'Alert updated');
});

export const deleteAlert = asyncHandler(async (req: Request, res: Response) => {
  await alertService.deleteAlert(req.params.id);
  return sendSuccess(res, null, 'Alert deleted');
});

export const acknowledgeAlert = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await alertService.acknowledgeAlert(req.params.id, req.user!.id), 'Alert acknowledged');
});

export const resolveAlert = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await alertService.resolveAlert(req.params.id, req.user!.id), 'Alert resolved');
});

/* Alert rules ------------------------------------------------------ */

export const ruleSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).default(''),
  metric: z.enum(RULE_METRICS),
  operator: z.enum(RULE_OPERATORS).default('>'),
  threshold: z.coerce.number().min(0).max(100000),
  duration: z.coerce.number().int().min(0).max(1440).default(5),
  severity: z.enum(SEVERITIES).default('warning'),
  enabled: z.boolean().default(true),
});

export const ruleUpdateSchema = ruleSchema.partial();

export const listRules = asyncHandler(async (_req: Request, res: Response) => {
  const rules = await AlertRule.find().sort({ enabled: -1, severity: 1, name: 1 }).lean();
  return sendSuccess(res, rules);
});

export const createRule = asyncHandler(async (req: Request, res: Response) => {
  const rule = await AlertRule.create({ ...(req.body as z.infer<typeof ruleSchema>), createdBy: req.user!.id });
  await invalidate(CacheKeys.alerts);
  return sendSuccess(res, rule, 'Alert rule created', 201);
});

export const updateRule = asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) throw new AppError(400, 'Invalid rule id');
  const rule = await AlertRule.findByIdAndUpdate(req.params.id, req.body as z.infer<typeof ruleUpdateSchema>, {
    new: true,
    runValidators: true,
  });
  if (!rule) throw new AppError(404, 'Alert rule not found');
  await invalidate(CacheKeys.alerts);
  return sendSuccess(res, rule, 'Alert rule updated');
});

export const deleteRule = asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) throw new AppError(400, 'Invalid rule id');
  const rule = await AlertRule.findByIdAndDelete(req.params.id);
  if (!rule) throw new AppError(404, 'Alert rule not found');
  await invalidate(CacheKeys.alerts);
  return sendSuccess(res, null, 'Alert rule deleted');
});
