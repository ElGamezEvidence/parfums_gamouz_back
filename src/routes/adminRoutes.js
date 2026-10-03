import { Router } from 'express';
import { authenticateToken, requirePasswordChanged, requireRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { dashboardController } from '../controllers/dashboardController.js';
import { productController, productCreateSchema } from '../controllers/productController.js';
import { categoryController, categoryCreateSchema } from '../controllers/categoryController.js';
import { orderController, updateOrderStatusSchema } from '../controllers/orderController.js';
import { couponController } from '../controllers/couponController.js';
import { reviewController } from '../controllers/reviewController.js';
import { contentController } from '../controllers/contentController.js';
import { contactNewsletterController } from '../controllers/contactNewsletterController.js';
import { userController, userCreateSchema } from '../controllers/userController.js';
import { mediaController } from '../controllers/mediaController.js';
import { productImageUpload } from '../middleware/upload.js';

const router = Router();

const handleUpload =
  (multerMiddleware, handler) =>
  (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) return next(err);
      return handler(req, res, next);
    });
  };

// Secure all admin routes with authentication, password-change enforcement & staff roles
router.use(
  authenticateToken,
  requirePasswordChanged,
  requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EDITOR', 'SUPPORT')
);

// 1. Dashboard Metrics
router.get('/dashboard/stats', dashboardController.getStats);

// Médias — import photos produit depuis fichiers locaux
router.post(
  '/media/upload',
  handleUpload(productImageUpload.single('image'), mediaController.uploadProductImage)
);
router.post(
  '/media/upload-many',
  handleUpload(productImageUpload.array('images', 10), mediaController.uploadProductImages)
);
router.delete('/media/product/:filename', mediaController.deleteProductImage);

// 2. Products Management
router.get('/products', productController.adminGetProducts);
router.get('/products/:id', productController.adminGetProductById);
router.post('/products', validateBody(productCreateSchema), productController.adminCreateProduct);
router.put('/products/:id', productController.adminUpdateProduct);
router.delete(
  '/products/:id',
  requireRole('SUPER_ADMIN', 'ADMIN', 'MANAGER'),
  productController.adminDeleteProduct
);

// 3. Inventory & Stock
router.post('/inventory/movement', productController.adminAdjustStock);

// 4. Categories
router.get('/categories', categoryController.adminGetCategories);
router.post('/categories', validateBody(categoryCreateSchema), categoryController.adminCreateCategory);

// 5. Orders Management
router.get('/orders', orderController.adminGetOrders);
router.put('/orders/:id/status', validateBody(updateOrderStatusSchema), orderController.adminUpdateOrderStatus);

// 6. Coupons & Promotions
router.get('/coupons', couponController.adminGetCoupons);
router.post('/coupons', couponController.adminCreateCoupon);

// 7. Reviews Moderation
router.get('/reviews', reviewController.adminGetReviews);
router.put('/reviews/:id/moderate', reviewController.adminModerateReview);

// 8. CMS Content & Settings
router.get('/content', contentController.adminGetContents);
router.put('/content/:key', contentController.adminUpdateContent);
router.get('/settings', contentController.adminGetSettings);
router.put('/settings/:key', contentController.adminUpdateSetting);

// 9. Contact Messages & Subscribers
router.get('/messages', contactNewsletterController.adminGetMessages);
router.get('/subscribers', contactNewsletterController.adminGetSubscribers);

// 10. Customers & Internal Staff (Staff management requires SUPER_ADMIN)
router.get('/customers', userController.adminGetCustomers);
router.get('/users', requireRole('SUPER_ADMIN'), userController.adminGetUsers);
router.post('/users', requireRole('SUPER_ADMIN'), validateBody(userCreateSchema), userController.adminCreateUser);

// 11. Audit Logs (SUPER_ADMIN and ADMIN)
router.get('/audit-logs', requireRole('SUPER_ADMIN', 'ADMIN'), userController.adminGetAuditLogs);

export default router;
