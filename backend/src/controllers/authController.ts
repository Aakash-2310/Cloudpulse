import crypto from 'crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { User } from '../models/User';
import { AUTH_COOKIE, durationToMs, signToken } from '../utils/jwt';
import { AppError, asyncHandler, sendSuccess } from '../utils/http';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean().optional(),
});

export const forgotSchema = z.object({ email: z.string().trim().toLowerCase().email() });
export const resetSchema = z.object({ token: z.string().min(20), password });

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  title: z.string().trim().max(80).optional(),
  avatar: z.string().url().max(500).optional().or(z.literal('')),
  preferences: z
    .object({
      theme: z.enum(['light', 'dark', 'system']).optional(),
      emailNotifications: z.boolean().optional(),
      defaultEnvironment: z.enum(['all', 'production', 'staging', 'development']).optional(),
    })
    .optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

function setAuthCookie(res: Response, token: string, remember = true) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    path: '/',
    ...(remember ? { maxAge: durationToMs(env.jwtExpiresIn) } : {}),
  });
}

function publicUser(user: { toJSON: () => unknown }) {
  return user.toJSON();
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password: pwd } = req.body as z.infer<typeof registerSchema>;
  if (await User.exists({ email })) throw new AppError(409, 'An account with this email already exists');
  // Self-registered users start as viewers; admins can promote them from the Users page.
  const user = await User.create({ name, email, password: pwd, role: 'viewer' });
  const token = signToken({ sub: String(user._id), role: user.role });
  setAuthCookie(res, token);
  return sendSuccess(res, { user: publicUser(user) }, 'Account created', 201);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password: pwd, remember } = req.body as z.infer<typeof loginSchema>;
  const user = await User.findOne({ email }).select('+password');
  // Same message for unknown email and wrong password to avoid account enumeration.
  if (!user || !(await user.comparePassword(pwd))) throw new AppError(401, 'Invalid email or password');
  if (!user.active) throw new AppError(403, 'This account has been disabled. Contact your administrator.');
  user.lastLoginAt = new Date();
  await user.save();
  const token = signToken({ sub: String(user._id), role: user.role });
  setAuthCookie(res, token, remember !== false);
  return sendSuccess(res, { user: publicUser(user) }, 'Signed in');
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie(AUTH_COOKIE, { httpOnly: true, secure: env.cookieSecure, sameSite: 'lax', path: '/' });
  return sendSuccess(res, null, 'Signed out');
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw new AppError(404, 'User not found');
  return sendSuccess(res, { user: publicUser(user) });
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof updateProfileSchema>;
  const user = await User.findById(req.user!.id);
  if (!user) throw new AppError(404, 'User not found');
  if (body.name !== undefined) user.name = body.name;
  if (body.title !== undefined) user.title = body.title;
  if (body.avatar !== undefined) user.avatar = body.avatar || undefined;
  if (body.preferences) {
    for (const [key, value] of Object.entries(body.preferences)) {
      if (value !== undefined) user.set(`preferences.${key}`, value);
    }
  }
  await user.save();
  return sendSuccess(res, { user: publicUser(user) }, 'Profile updated');
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;
  const user = await User.findById(req.user!.id).select('+password');
  if (!user) throw new AppError(404, 'User not found');
  if (!(await user.comparePassword(currentPassword))) throw new AppError(400, 'Current password is incorrect');
  user.password = newPassword;
  await user.save();
  return sendSuccess(res, null, 'Password updated');
});

/**
 * Issues a single-use reset token (stored as a SHA-256 hash, valid 30 minutes).
 * No email transport is configured in this project, so the reset link is written to the server log;
 * plug an SMTP/SES provider in here for production. The response never reveals whether the email exists.
 */
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as z.infer<typeof forgotSchema>;
  const user = await User.findOne({ email });
  if (user && user.active) {
    const token = crypto.randomBytes(32).toString('hex');
    user.passwordResetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + 30 * 60_000);
    await user.save();
    logger.info(`Password reset requested for ${email}. Reset link: ${env.appUrl}/reset-password?token=${token}`);
  }
  return sendSuccess(res, null, 'If an account exists for this email, a reset link has been sent.');
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, password: pwd } = req.body as z.infer<typeof resetSchema>;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({ passwordResetTokenHash: hash, passwordResetExpires: { $gt: new Date() } }).select(
    '+passwordResetTokenHash +passwordResetExpires',
  );
  if (!user) throw new AppError(400, 'This reset link is invalid or has expired');
  user.password = pwd;
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  return sendSuccess(res, null, 'Password has been reset. You can now sign in.');
});
