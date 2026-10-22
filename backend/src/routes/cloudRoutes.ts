import { Router } from 'express';
import * as cloud from '../controllers/cloudController';
import { protect } from '../middleware/authMiddleware';
import { authorize } from '../middleware/roleMiddleware';
import { validateBody } from '../middleware/validate';

const router = Router();
router.use(protect);

router.get('/', cloud.listAccounts);
router.get('/providers', cloud.providersOverview);
router.post('/validate', authorize('admin'), validateBody(cloud.validateSchema), cloud.validateAccount);
router.post('/', authorize('admin'), validateBody(cloud.createAccountSchema), cloud.createAccount);
router.get('/:id', cloud.getAccount);
router.put('/:id', authorize('admin'), validateBody(cloud.updateAccountSchema), cloud.updateAccount);
router.delete('/:id', authorize('admin'), cloud.deleteAccount);
router.post('/:id/sync', authorize('admin', 'operator'), cloud.syncAccount);

export default router;
