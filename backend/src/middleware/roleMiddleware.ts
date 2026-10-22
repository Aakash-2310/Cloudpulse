import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '../models/User';
import { AppError } from '../utils/http';

/**
 * Restricts a route to the given roles. Must run after `protect`.
 *
 * Role matrix:
 *  - admin:    everything
 *  - operator: read everything + acknowledge/resolve alerts, sync accounts
 *  - viewer:   read-only dashboards, resources, metrics, reports
 */
export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, `This action requires one of the roles: ${roles.join(', ')}`));
    }
    return next();
  };
}
