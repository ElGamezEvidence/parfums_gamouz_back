import { Router } from 'express';
import authRoutes from './authRoutes.js';
import productRoutes from './productRoutes.js';
import categoryRoutes from './categoryRoutes.js';
import orderRoutes from './orderRoutes.js';
import couponRoutes from './couponRoutes.js';
import contentRoutes from './contentRoutes.js';
import collectionRoutes from './collectionRoutes.js';
import adminRoutes from './adminRoutes.js';
import { healthController } from '../controllers/healthController.js';

const router = Router();

// Health check endpoint
router.get('/health', healthController.check);

// Public & Customer routes
router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
router.use('/collections', collectionRoutes);
router.use('/orders', orderRoutes);
router.use('/coupons', couponRoutes);
router.use('/content', contentRoutes);

// Protected Admin back-office routes
router.use('/admin', adminRoutes);

export default router;
