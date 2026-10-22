import { Router } from 'express';
import * as alerts from '../controllers/alertController';
import { protect } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';
import { validateBody } from '../middleware/validate';

/** Mounted at /api/alerts */
export const alertRouter = Router();
alertRouter.use(protect);
alertRouter.get('/', alerts.listAlerts);
alertRouter.post('/', authorize('admin', 'operator'), validateBody(alerts.createAlertSchema), alerts.createAlert);
alertRouter.get('/:id', alerts.getAlert);
alertRouter.put('/:id', authorize('admin', 'operator'), validateBody(alerts.updateAlertSchema), alerts.updateAlert);
alertRouter.delete('/:id', authorize('admin'), alerts.deleteAlert);
alertRouter.post('/:id/acknowledge', authorize('admin', 'operator'), alerts.acknowledgeAlert);
alertRouter.post('/:id/resolve', authorize('admin', 'operator'), alerts.resolveAlert);

/** Mounted at /api/alert-rules */
export const alertRuleRouter = Router();
alertRuleRouter.use(protect);
alertRuleRouter.get('/', alerts.listRules);
alertRuleRouter.post('/', authorize('admin'), validateBody(alerts.ruleSchema), alerts.createRule);
alertRuleRouter.put('/:id', authorize('admin'), validateBody(alerts.ruleUpdateSchema), alerts.updateRule);
alertRuleRouter.delete('/:id', authorize('admin'), alerts.deleteRule);

export default alertRouter;
