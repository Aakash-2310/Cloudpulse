import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { UserRole } from '../models/User';

export interface TokenPayload {
  sub: string;
  role: UserRole;
}

export const AUTH_COOKIE = 'cp_token';

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
    issuer: 'cloudpulse',
  });
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.jwtSecret, { issuer: 'cloudpulse' });
  if (typeof decoded === 'string' || !decoded.sub || !('role' in decoded)) {
    throw new Error('Malformed token');
  }
  return { sub: String(decoded.sub), role: decoded.role as UserRole };
}

/** Parses durations such as "8h", "30m", "7d" into milliseconds (used for cookie maxAge). */
export function durationToMs(value: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(value.trim());
  if (!match) return 8 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = match[2] ?? 's';
  const factor = unit === 'd' ? 86_400_000 : unit === 'h' ? 3_600_000 : unit === 'm' ? 60_000 : 1000;
  return amount * factor;
}
