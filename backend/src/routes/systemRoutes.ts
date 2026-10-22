import { Router, type NextFunction, type Request, type Response } from 'express';
import * as system from '../controllers/systemController';
import { exportReport } from '../controllers/reportController';
import { protect } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';
import { validateBody } from '../middleware/validate';

/** Mounted at /api/health (public liveness/readiness probe). */
export const healthRouter = Router();
healthRouter.get('/', system.health);

/** Mounted at /api/system (admin). */
export const systemRouter = Router();
systemRouter.use(protect, authorize('admin'));
systemRouter.get('/status', system.systemStatus);
systemRouter.post('/monitoring/run', system.triggerCycle);

/** Mounted at /api/notifications */
export const notificationRouter = Router();
notificationRouter.use(protect);
notificationRouter.get('/', system.listNotifications);
notificationRouter.post('/read-all', system.readAllNotifications);
notificationRouter.post('/:id/read', system.readNotification);

/** Mounted at /api/search */
export const searchRouter = Router();
searchRouter.get('/', protect, system.search);

/** Mounted at /api/users (admin). */
export const userRouter = Router();
userRouter.use(protect, authorize('admin'));
userRouter.get('/', system.listUsers);
userRouter.post('/', validateBody(system.createUserSchema), system.createUser);
userRouter.put('/:id', validateBody(system.updateUserSchema), system.updateUser);
userRouter.delete('/:id', system.deleteUser);

/** Mounted at /api/reports – cost exports need FinOps access. */
export const reportRouter = Router();
reportRouter.use(protect);
reportRouter.get(
  '/:type',
  (req: Request, res: Response, next: NextFunction) =>
    ['costs', 'summary'].includes(req.params.type) ? authorize('admin', 'operator')(req, res, next) : next(),
  exportReport,
);
