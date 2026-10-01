import { z } from 'zod';
import { prisma } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditAction } from '../middleware/audit.js';

export const validateCouponSchema = z.object({
  code: z.string().min(1, 'Le code promo est requis.').trim().toUpperCase(),
  subtotal: z.coerce.number().min(0, 'Le montant doit être positif.'),
});

export const couponController = {
  // POST /api/v1/coupons/validate (Public cart/checkout validation)
  async validateCoupon(req, res, next) {
    try {
      const { code, subtotal } = req.body;

      const coupon = await prisma.coupon.findUnique({
        where: { code: code.toUpperCase() },
      });

      if (!coupon || !coupon.isActive) {
        return next(new AppError('Ce code promo est invalide ou expiré.', 404, 'COUPON_NOT_FOUND'));
      }

      if (coupon.startsAt && new Date(coupon.startsAt) > new Date()) {
        return next(new AppError('Ce code promo n\'est pas encore actif.', 400, 'COUPON_NOT_ACTIVE'));
      }

      if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        return next(new AppError('Ce code promo a expiré.', 400, 'COUPON_EXPIRED'));
      }

      if (coupon.maxUsage && coupon.usedCount >= coupon.maxUsage) {
        return next(new AppError('La limite d\'utilisation de ce code promo a été atteinte.', 400, 'COUPON_MAX_REACHED'));
      }

      if (coupon.minOrderAmount && subtotal < Number(coupon.minOrderAmount)) {
        return next(
          new AppError(
            `Ce code nécessite un panier minimum de ${coupon.minOrderAmount} MAD.`,
            400,
            'COUPON_MIN_AMOUNT'
          )
        );
      }

      let discountAmount = 0;
      if (coupon.discountType === 'PERCENTAGE') {
        discountAmount = (subtotal * Number(coupon.discountValue)) / 100;
      } else {
        discountAmount = Number(coupon.discountValue);
      }

      if (discountAmount > subtotal) {
        discountAmount = subtotal;
      }

      res.json({
        success: true,
        data: {
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: Number(coupon.discountValue),
          discountAmount: Math.round(discountAmount),
          finalTotal: Math.round(subtotal - discountAmount),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: GET /api/v1/admin/coupons
  async adminGetCoupons(req, res, next) {
    try {
      const coupons = await prisma.coupon.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { redemptions: true } },
        },
      });

      res.json({
        success: true,
        data: coupons.map((c) => ({
          id: c.id,
          code: c.code,
          discountType: c.discountType,
          discountValue: Number(c.discountValue),
          minOrderAmount: c.minOrderAmount ? Number(c.minOrderAmount) : null,
          maxUsage: c.maxUsage,
          usedCount: c.usedCount,
          isActive: c.isActive,
          expiresAt: c.expiresAt,
          createdAt: c.createdAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: POST /api/v1/admin/coupons
  async adminCreateCoupon(req, res, next) {
    try {
      const { code, discountType, discountValue, minOrderAmount, maxUsage, expiresAt } = req.body;

      const existing = await prisma.coupon.findUnique({
        where: { code: code.toUpperCase() },
      });

      if (existing) {
        return next(new AppError('Un code promo identique existe déjà.', 409));
      }

      const created = await prisma.coupon.create({
        data: {
          code: code.toUpperCase(),
          discountType,
          discountValue: Number(discountValue),
          minOrderAmount: minOrderAmount ? Number(minOrderAmount) : null,
          maxUsage: maxUsage ? Number(maxUsage) : null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          isActive: true,
        },
      });

      await logAuditAction(req, 'CREATE_COUPON', 'Coupon', created.id, { code: created.code });

      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  },
};
