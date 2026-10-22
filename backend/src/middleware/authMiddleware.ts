import type { NextFunction, Request, Response } from 'express';
import { User, type UserRole } from '../models/User';
import { AUTH_COOKIE, verifyToken } from '../utils/jwt';
import { AppError, asyncHandler } from '../utils/http';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[AUTH_COOKIE] as string | undefined;
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/** Requires a valid JWT (HTTP-only cookie or Bearer header) for an active user. */
export const protect = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) throw new AppError(401, 'Authentication required');

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new AppError(401, 'Session expired or invalid. Please sign in again.');
  }

  const user = await User.findById(payload.sub).select('name email role active').lean();
  if (!user || !user.active) throw new AppError(401, 'Account not found or disabled');

  req.user = { id: String(user._id), name: user.name, email: user.email, role: user.role };
  next();
});
