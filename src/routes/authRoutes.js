import { Router } from 'express';
import {
  authController,
  registerSchema,
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../controllers/authController.js';
import { authenticateToken, requirePasswordChanged } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Public auth routes (rate limited)
router.post('/register', authLimiter, validateBody(registerSchema), authController.register);
router.post('/login', authLimiter, validateBody(loginSchema), authController.login);
router.post('/forgot-password', authLimiter, validateBody(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', authLimiter, validateBody(resetPasswordSchema), authController.resetPassword);

// Authenticated routes
router.post('/logout', authenticateToken, authController.logout);
router.post(
  '/change-password',
  authenticateToken,
  validateBody(changePasswordSchema),
  authController.changePassword
);
// Profil accessible même si changement de mot de passe obligatoire (état de session)
router.get('/me', authenticateToken, authController.getMe);

export default router;
