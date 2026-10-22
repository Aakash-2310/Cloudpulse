import { Router } from 'express';
import * as costs from '../controllers/costController';
import { protect } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';

const router = Router();
// Cost data is visible to administrators and operators (see role matrix in README).
router.use(protect, authorize('admin', 'operator'));

router.get('/', costs.listCosts);
router.get('/summary', costs.summary);
router.get('/by-provider', costs.byProvider);
router.get('/by-service', costs.byService);
router.get('/by-region', costs.byRegion);
router.get('/anomalies', costs.anomalies);

export default router;
