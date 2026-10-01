import { Router } from 'express';
import { orderController, createOrderSchema } from '../controllers/orderController.js';
import { validateBody } from '../middleware/validate.js';
import { orderLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/', orderLimiter, validateBody(createOrderSchema), orderController.createOrder);
router.get('/:orderNumber', orderController.getOrderByNumber);

export default router;
