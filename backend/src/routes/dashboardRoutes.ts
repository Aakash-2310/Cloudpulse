import { Router } from 'express';
import * as dashboard from '../controllers/dashboardController';
import { protect } from '../middleware/authMiddleware';

/** Mounted at /api/dashboard */
export const dashboardRouter = Router();
dashboardRouter.use(protect);
dashboardRouter.get('/summary', dashboard.summary);
dashboardRouter.get('/metrics', dashboard.metrics);
dashboardRouter.get('/insights', dashboard.insights);

/** Mounted at /api/monitoring */
export const monitoringRouter = Router();
monitoringRouter.use(protect);
monitoringRouter.get('/compute', dashboard.compute);
monitoringRouter.get('/storage', dashboard.storage);
monitoringRouter.get('/network', dashboard.network);

/** Mounted at /api/service-health */
export const serviceHealthRouter = Router();
serviceHealthRouter.get('/', protect, dashboard.serviceHealth);

export default dashboardRouter;
