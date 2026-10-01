import { z } from 'zod';
import { prisma } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditAction } from '../middleware/audit.js';

export const createReviewSchema = z.object({
  productId: z.string().min(1),
  authorName: z.string().min(2, 'Le nom est requis.').trim(),
  authorEmail: z.string().email().optional(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().min(5, 'Le commentaire doit comporter au moins 5 caractères.').trim(),
});

export const reviewController = {
  // POST /api/v1/reviews (Submit customer review)
  async submitReview(req, res, next) {
    try {
      const data = req.body;

      const product = await prisma.product.findUnique({
        where: { id: data.productId },
      });

      if (!product) {
        return next(new AppError('Produit introuvable.', 404));
      }

      // Check if verified purchase
      let isVerifiedPurchase = false;
      if (req.user || data.authorEmail) {
        const email = req.user ? req.user.email : data.authorEmail;
        const matchingOrder = await prisma.order.findFirst({
          where: {
            customerEmail: email,
            orderStatus: { in: ['DELIVERED', 'SHIPPED', 'CONFIRMED'] },
            items: { some: { productId: data.productId } },
          },
        });
        if (matchingOrder) {
          isVerifiedPurchase = true;
        }
      }

      const review = await prisma.review.create({
        data: {
          productId: data.productId,
          userId: req.user ? req.user.id : null,
          authorName: data.authorName,
          authorEmail: data.authorEmail || null,
          rating: data.rating,
          comment: data.comment,
          isVerifiedPurchase,
          status: 'PENDING', // Requires admin moderation
        },
      });

      res.status(201).json({
        success: true,
        message: 'Merci pour votre avis. Il sera publié après validation par notre équipe.',
        data: { id: review.id },
      });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: GET /api/v1/admin/reviews
  async adminGetReviews(req, res, next) {
    try {
      const { status } = req.query;

      const where = {};
      if (status && status !== 'ALL') where.status = status;

      const reviews = await prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          product: {
            select: { sku: true, slug: true, translations: { where: { locale: 'fr' } } },
          },
        },
      });

      const items = reviews.map((r) => ({
        id: r.id,
        productName: r.product.translations[0]?.name || r.product.sku,
        productSlug: r.product.slug,
        authorName: r.authorName,
        rating: r.rating,
        comment: r.comment,
        brandReply: r.brandReply,
        status: r.status,
        isVerifiedPurchase: r.isVerifiedPurchase,
        createdAt: r.createdAt,
      }));

      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: PUT /api/v1/admin/reviews/:id/moderate
  async adminModerateReview(req, res, next) {
    try {
      const { id } = req.params;
      const { status, brandReply } = req.body;

      if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
        return next(new AppError('Statut de modération invalide.', 400));
      }

      const updated = await prisma.review.update({
        where: { id },
        data: {
          status,
          ...(brandReply !== undefined ? { brandReply } : {}),
        },
      });

      await logAuditAction(req, 'MODERATE_REVIEW', 'Review', id, { status });

      res.json({ success: true, message: 'Avis modéré avec succès.', data: updated });
    } catch (err) {
      next(err);
    }
  },
};
