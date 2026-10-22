import type { Request, Response } from 'express';
import { z } from 'zod';
import { ENVIRONMENTS, PROVIDERS } from '../models/types';
import { AppError, asyncHandler, sendSuccess } from '../utils/http';
import * as cloudService from '../services/cloudService';

const credentials = z.record(z.string().max(4096)).default({});

export const validateSchema = z.object({
  provider: z.enum(PROVIDERS),
  accountName: z.string().trim().min(2).max(80),
  accountId: z.string().trim().min(3).max(80),
  environment: z.enum(ENVIRONMENTS).default('production'),
  credentials,
});

export const createAccountSchema = validateSchema;

export const updateAccountSchema = z.object({
  accountName: z.string().trim().min(2).max(80).optional(),
  environment: z.enum(ENVIRONMENTS).optional(),
  status: z.enum(['connected', 'disconnected']).optional(),
});

export const listAccounts = asyncHandler(async (req: Request, res: Response) => {
  const data = await cloudService.listAccounts(req.query.provider as string | undefined);
  return sendSuccess(res, data);
});

export const providersOverview = asyncHandler(async (_req: Request, res: Response) => {
  return sendSuccess(res, await cloudService.getProvidersOverview());
});

export const getAccount = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await cloudService.getAccount(req.params.id));
});

/** Wizard step 3: validate credentials without saving anything. */
export const validateAccount = asyncHandler(async (req: Request, res: Response) => {
  const result = await cloudService.validateConnection(req.body as z.infer<typeof validateSchema>);
  if (!result.ok) throw new AppError(422, result.message);
  return sendSuccess(res, result, 'Connection validated');
});

/** Wizard step 4–5: validate, persist the account and run the first synchronization. */
export const createAccount = asyncHandler(async (req: Request, res: Response) => {
  const data = await cloudService.createAccount(req.body as z.infer<typeof createAccountSchema>, req.user!.id);
  return sendSuccess(res, data, 'Cloud account connected', 201);
});

export const updateAccount = asyncHandler(async (req: Request, res: Response) => {
  const account = await cloudService.updateAccount(req.params.id, req.body as z.infer<typeof updateAccountSchema>);
  return sendSuccess(res, account, 'Cloud account updated');
});

export const deleteAccount = asyncHandler(async (req: Request, res: Response) => {
  const data = await cloudService.deleteAccount(req.params.id);
  return sendSuccess(res, data, 'Cloud account removed');
});

export const syncAccount = asyncHandler(async (req: Request, res: Response) => {
  const data = await cloudService.syncAccountById(req.params.id);
  return sendSuccess(res, data, `Synchronized ${data.discovered} resources`);
});
