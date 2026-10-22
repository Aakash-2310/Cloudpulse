import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { User, USER_ROLES } from '../models/User';
import { Resource } from '../models/Resource';
import { CloudAccount } from '../models/CloudAccount';
import { ServiceHealth } from '../models/ServiceHealth';
import { Alert } from '../models/Alert';
import { CostRecord } from '../models/CostRecord';
import { Metric } from '../models/Metric';
import { AppError, asyncHandler, escapeRegex, sendSuccess } from '../utils/http';
import { isDatabaseConnected } from '../config/database';
import { isRedisConnected } from '../config/redis';
import { cacheStats } from '../services/redisService';
import { monitoringStatus, runMonitoringCycle } from '../services/monitoringService';
import * as notifications from '../services/notificationService';
import { env } from '../config/env';

/* Health ------------------------------------------------------------ */

export const health = asyncHandler(async (_req: Request, res: Response) => {
  const mongo = isDatabaseConnected();
  const redis = isRedisConnected();
  const status = mongo ? (redis ? 'ok' : 'degraded') : 'down';
  res.status(mongo ? 200 : 503).json({
    success: mongo,
    data: {
      status,
      version: process.env.npm_package_version ?? '1.0.0',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      dependencies: { mongodb: mongo ? 'connected' : 'disconnected', redis: redis ? 'connected' : 'disconnected' },
    },
    message: status === 'ok' ? 'All systems operational' : status === 'degraded' ? 'Running without cache' : 'Database unavailable',
  });
});

/** Detailed system information for administrators. */
export const systemStatus = asyncHandler(async (_req: Request, res: Response) => {
  const [resources, accounts, alerts, metrics, costs, users] = await Promise.all([
    Resource.estimatedDocumentCount(),
    CloudAccount.estimatedDocumentCount(),
    Alert.estimatedDocumentCount(),
    Metric.estimatedDocumentCount(),
    CostRecord.estimatedDocumentCount(),
    User.estimatedDocumentCount(),
  ]);
  return sendSuccess(res, {
    environment: env.nodeEnv,
    providerMode: env.cloudProviderMode,
    demoMode: env.demoMode,
    mongodb: isDatabaseConnected() ? 'connected' : 'disconnected',
    redis: isRedisConnected() ? 'connected' : 'disconnected',
    cache: { ...cacheStats(), ttl: env.cacheTtl },
    monitoring: monitoringStatus(),
    counts: { resources, accounts, alerts, metrics, costs, users },
    uptimeSeconds: Math.round(process.uptime()),
    nodeVersion: process.version,
  });
});

export const triggerCycle = asyncHandler(async (_req: Request, res: Response) => {
  await runMonitoringCycle();
  return sendSuccess(res, monitoringStatus(), 'Monitoring cycle completed');
});

/* Notifications ----------------------------------------------------- */

export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await notifications.listNotifications(req.user!.id, 25));
});

export const readNotification = asyncHandler(async (req: Request, res: Response) => {
  await notifications.markRead(req.user!.id, req.params.id);
  return sendSuccess(res, null, 'Notification marked as read');
});

export const readAllNotifications = asyncHandler(async (req: Request, res: Response) => {
  const count = await notifications.markAllRead(req.user!.id);
  return sendSuccess(res, { count }, 'All notifications marked as read');
});

/* Global search ----------------------------------------------------- */

export const search = asyncHandler(async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim().slice(0, 80);
  if (q.length < 2) return sendSuccess(res, { resources: [], accounts: [], services: [], alerts: [] });
  const rx = new RegExp(escapeRegex(q), 'i');
  const [resources, accounts, services, alerts] = await Promise.all([
    Resource.find({ $or: [{ name: rx }, { resourceId: rx }, { service: rx }] })
      .select('name provider type region status service')
      .limit(6)
      .lean(),
    CloudAccount.find({ $or: [{ accountName: rx }, { accountId: rx }] }).select('accountName accountId provider status').limit(4).lean(),
    ServiceHealth.find({ $or: [{ name: rx }, { description: rx }] }).select('name status category provider').limit(4).lean(),
    Alert.find({ $or: [{ title: rx }, { resourceName: rx }] }).select('title severity status createdAt').sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  return sendSuccess(res, { resources, accounts, services, alerts });
});

/* Users (admin) ----------------------------------------------------- */

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
  role: z.enum(USER_ROLES).default('viewer'),
  title: z.string().trim().max(80).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  role: z.enum(USER_ROLES).optional(),
  title: z.string().trim().max(80).optional(),
  active: z.boolean().optional(),
});

export const listUsers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await User.find().sort({ role: 1, name: 1 });
  return sendSuccess(res, users.map((u) => u.toJSON()));
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof createUserSchema>;
  if (await User.exists({ email: body.email })) throw new AppError(409, 'A user with this email already exists');
  const user = await User.create(body);
  return sendSuccess(res, user.toJSON(), 'User created', 201);
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) throw new AppError(400, 'Invalid user id');
  const body = req.body as z.infer<typeof updateUserSchema>;
  if (req.params.id === req.user!.id && (body.role && body.role !== 'admin' || body.active === false)) {
    throw new AppError(400, 'You cannot demote or disable your own account');
  }
  const user = await User.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!user) throw new AppError(404, 'User not found');
  return sendSuccess(res, user.toJSON(), 'User updated');
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) throw new AppError(400, 'Invalid user id');
  if (req.params.id === req.user!.id) throw new AppError(400, 'You cannot delete your own account');
  const target = await User.findById(req.params.id);
  if (!target) throw new AppError(404, 'User not found');
  if (target.role === 'admin' && (await User.countDocuments({ role: 'admin', active: true })) <= 1) {
    throw new AppError(400, 'At least one active administrator is required');
  }
  await target.deleteOne();
  return sendSuccess(res, null, 'User deleted');
});
