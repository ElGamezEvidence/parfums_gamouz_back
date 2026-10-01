import { z } from 'zod';
import { prisma } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditAction } from '../middleware/audit.js';

export const categoryCreateSchema = z.object({
  slug: z.string().min(2).toLowerCase().trim(),
  image: z.string().url().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  translations: z.object({
    fr: z.object({ name: z.string().min(2), description: z.string().optional() }),
    en: z.object({ name: z.string().min(2), description: z.string().optional() }),
    ar: z.object({ name: z.string().min(2), description: z.string().optional() }),
  }),
});

export const categoryController = {
  // GET /api/v1/categories (Public)
  async getCategories(req, res, next) {
    try {
      const locale = req.query.locale || 'fr';

      const categories = await prisma.category.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          translations: { where: { locale } },
          _count: { select: { products: { where: { status: 'PUBLISHED' } } } },
        },
      });

      const formatted = categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        image: c.image,
        name: c.translations[0]?.name || c.slug,
        description: c.translations[0]?.description || '',
        productsCount: c._count.products,
      }));

      res.json({ success: true, data: formatted });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: GET /api/v1/admin/categories
  async adminGetCategories(req, res, next) {
    try {
      const categories = await prisma.category.findMany({
        orderBy: { sortOrder: 'asc' },
        include: {
          translations: true,
          _count: { select: { products: true } },
        },
      });

      res.json({ success: true, data: categories });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: POST /api/v1/admin/categories
  async adminCreateCategory(req, res, next) {
    try {
      const data = req.body;

      const existing = await prisma.category.findUnique({ where: { slug: data.slug } });
      if (existing) {
        return next(new AppError('Une catégorie avec ce slug existe déjà.', 409));
      }

      const category = await prisma.category.create({
        data: {
          slug: data.slug,
          image: data.image || null,
          sortOrder: data.sortOrder,
          isActive: data.isActive,
          translations: {
            create: Object.entries(data.translations).map(([locale, t]) => ({
              locale,
              name: t.name,
              description: t.description || null,
            })),
          },
        },
        include: { translations: true },
      });

      await logAuditAction(req, 'CREATE_CATEGORY', 'Category', category.id, { slug: category.slug });

      res.status(201).json({ success: true, data: category });
    } catch (err) {
      next(err);
    }
  },
};
