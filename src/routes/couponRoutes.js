import { Router } from 'express';
import { couponController, validateCouponSchema } from '../controllers/couponController.js';
import { validateBody } from '../middleware/validate.js';

const router = Router();

router.post('/validate', validateBody(validateCouponSchema), couponController.validateCoupon);

export default router;
