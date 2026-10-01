import { Router } from 'express';
import { productController, productQuerySchema } from '../controllers/productController.js';
import { validateQuery } from '../middleware/validate.js';

const router = Router();

router.get('/', validateQuery(productQuerySchema), productController.getProducts);
router.get('/featured', productController.getFeatured);
router.get('/:slug', productController.getProductBySlug);

export default router;
