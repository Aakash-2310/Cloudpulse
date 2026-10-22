import type { Request, Response } from 'express';
import { asyncHandler, parsePagination, sendSuccess } from '../utils/http';
import * as costService from '../services/costService';

function days(value: unknown, fallback = 30): number {
  const n = Number(value);
  return [7, 14, 30, 60, 90].includes(n) ? n : fallback;
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export const listCosts = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query, 50, 500);
  const q = req.query as Record<string, string | undefined>;
  const { items, total } = await costService.listCostRecords({
    provider: q.provider,
    service: q.service,
    region: q.region,
    from: parseDate(q.from),
    to: parseDate(q.to),
    page,
    limit,
    skip,
  });
  return sendSuccess(res, items, 'Request successful', 200, { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

export const summary = asyncHandler(async (_req: Request, res: Response) => {
  const [totals, monthly, daily] = await Promise.all([costService.getCostSummary(), costService.getMonthlyTrend(6), costService.getDailyTrend(30)]);
  return sendSuccess(res, { ...totals, monthly, daily });
});

export const byProvider = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await costService.getCostBreakdown('provider', days(req.query.days)));
});

export const byService = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await costService.getCostBreakdown('service', days(req.query.days), req.query.provider as string | undefined));
});

export const byRegion = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await costService.getCostBreakdown('region', days(req.query.days), req.query.provider as string | undefined));
});

export const anomalies = asyncHandler(async (req: Request, res: Response) => {
  const threshold = Number(req.query.threshold);
  const items = await costService.detectAnomalies(Number.isFinite(threshold) && threshold > 0 ? threshold : 20);
  return sendSuccess(res, items);
});
