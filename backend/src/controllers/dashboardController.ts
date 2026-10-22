import type { Request, Response } from 'express';
import { asyncHandler, sendSuccess } from '../utils/http';
import * as monitoring from '../services/monitoringService';

const envParam = (req: Request) => (typeof req.query.environment === 'string' ? req.query.environment : undefined);
const providerParam = (req: Request) => (typeof req.query.provider === 'string' ? req.query.provider : undefined);

export const summary = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await monitoring.getDashboardSummary(envParam(req)));
});

export const metrics = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await monitoring.getDashboardMetrics(req.query.range, envParam(req)));
});

export const insights = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await monitoring.getInsights(envParam(req)));
});

export const compute = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await monitoring.getComputeOverview(req.query.range, envParam(req), providerParam(req)));
});

export const storage = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await monitoring.getStorageOverview(envParam(req), providerParam(req)));
});

export const network = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await monitoring.getNetworkOverview(req.query.range, envParam(req), providerParam(req)));
});

export const serviceHealth = asyncHandler(async (_req: Request, res: Response) => {
  return sendSuccess(res, await monitoring.getServiceHealth());
});
