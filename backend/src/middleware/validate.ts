import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';

/** Validates and replaces req.body with the parsed (stripped, coerced) value. */
export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) return next(result.error);
    req.body = result.data;
    return next();
  };
}
