import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as auth from '../controllers/authController';
import { protect } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validate';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in a few minutes.' },
});

router.post('/register', authLimiter, validateBody(auth.registerSchema), auth.register);
router.post('/login', authLimiter, validateBody(auth.loginSchema), auth.login);
router.post('/logout', auth.logout);
router.post('/forgot-password', authLimiter, validateBody(auth.forgotSchema), auth.forgotPassword);
router.post('/reset-password', authLimiter, validateBody(auth.resetSchema), auth.resetPassword);
router.get('/me', protect, auth.me);
router.put('/me', protect, validateBody(auth.updateProfileSchema), auth.updateMe);
router.put('/password', protect, validateBody(auth.changePasswordSchema), auth.changePassword);

export default router;
