import { Router } from 'express';
import * as resources from '../controllers/resourceController';
import { protect } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';
import { validateBody } from '../middleware/validate';

const router = Router();
router.use(protect);

router.get('/', resources.listResources);
router.post('/', authorize('admin'), validateBody(resources.resourceSchema), resources.createResource);
router.get('/:id', resources.getResource);
router.put('/:id', authorize('admin'), validateBody(resources.resourceUpdateSchema), resources.updateResource);
router.delete('/:id', authorize('admin'), resources.deleteResource);
router.get('/:id/metrics', resources.getResourceMetricsHandler);

export default router;
