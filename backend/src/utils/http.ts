import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Operational error carrying an HTTP status code. */
export class AppError extends Error {
  constructor(public statusCode: number, message: string, public details?: unknown) {
    super(message);
    this.name = 'AppError';
  }
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Consistent success envelope: { success, data, message, meta? } */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Request successful',
  status = 200,
  meta?: PaginationMeta | Record<string, unknown>,
): Response {
  const body: Record<string, unknown> = { success: true, data, message };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

/** Wraps async route handlers so rejected promises reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function parsePagination(query: Record<string, unknown>, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(String(query.limit ?? defaultLimit), 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Most recent of a list of dates / ISO strings (null when empty). */
export function latestDate(values: Array<Date | string | null | undefined>): Date | null {
  let best: number | null = null;
  for (const v of values) {
    if (!v) continue;
    const t = new Date(v).getTime();
    if (!Number.isNaN(t) && (best === null || t > best)) best = t;
  }
  return best === null ? null : new Date(best);
}

export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
