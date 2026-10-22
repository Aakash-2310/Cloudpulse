import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AppError } from '../utils/http';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let message = 'Something went wrong';
  let errors: unknown;

  if (err instanceof AppError) {
    status = err.statusCode;
    message = err.message;
    errors = err.details;
  } else if (err instanceof ZodError) {
    status = 400;
    message = 'Validation failed';
    errors = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
    status = 409;
    const fields = Object.keys((err as { keyValue?: Record<string, unknown> }).keyValue ?? {});
    message = fields.length ? `A record with this ${fields.join(', ')} already exists` : 'Duplicate record';
  } else if (err instanceof SyntaxError && 'body' in err) {
    status = 400;
    message = 'Malformed JSON body';
  }

  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} failed`, err);
  }

  const body: Record<string, unknown> = { success: false, message };
  if (errors) body.errors = errors;
  if (!env.isProduction && status >= 500 && err instanceof Error) body.stack = err.stack;
  res.status(status).json(body);
}
