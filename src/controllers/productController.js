import { z } from 'zod';
import { prisma } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditAction } from '../middleware/audit.js';

export const productQuerySchema = z.object({
  category: z.string().optional(),
  badge: z.enum(['bestSeller', 'isNew', 'sale']).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  q: z.string().optional(),
  sortBy: z.enum(['price-asc', 'price-desc', 'newest', 'popularity', 'relevant']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  locale: z.enum(['fr', 'en', 'ar']).default('fr'),
});

export const productCreateSchema = z.object({
  sku: z.string().trim().optional(),
  slug: z.string().trim().optional(),
  basePrice: z.coerce.number().min(0).optional(),
  salePrice: z.coerce.number().positive().optional().nullable(),
  genderCategory: z.enum(['MEN', 'WOMEN', 'UNISEX']).default('UNISEX'),
  categoryId: z.string().optional().nullable(),
  isFeatured: z.boolean().default(false),
  isBestSeller: z.boolean().default(false),
  isNew: z.boolean().default(false),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('PUBLISHED'),
  translations: z.object({
    fr: z.object({
      name: z.string().min(2),
      shortDescription: z.string().optional(),
      fullDescription: z.string().optional(),
      olfactoryFamily: z.string().optional(),
      topNotes: z.string().optional(),
      heartNotes: z.string().optional(),
      baseNotes: z.string().optional(),
      usageAdvice: z.string().optional(),
    }),
    en: z.object({
      name: z.string().min(2),
      shortDescription: z.string().optional(),
      fullDescription: z.string().optional(),
      olfactoryFamily: z.string().optional(),
      topNotes: z.string().optional(),
      heartNotes: z.string().optional(),
      baseNotes: z.string().optional(),
      usageAdvice: z.string().optional(),
    }),
    ar: z.object({
      name: z.string().min(2),
      shortDescription: z.string().optional(),
      fullDescription: z.string().optional(),
      olfactoryFamily: z.string().optional(),
      topNotes: z.string().optional(),
      heartNotes: z.string().optional(),
      baseNotes: z.string().optional(),
      usageAdvice: z.string().optional(),
    }),
  }),
  variants: z
    .array(
      z.object({
        volume: z.string(), // e.g. "30ml", "50ml", "100ml"
        price: z.coerce.number().positive(),
        salePrice: z.coerce.number().positive().optional().nullable(),
        sku: z.string().trim().optional(),
        stockQuantity: z.coerce.number().int().min(0).default(10),
        alertThreshold: z.coerce.number().int().min(0).default(5),
        isDefault: z.boolean().default(false),
      })
    )
    .min(1, 'Au moins une contenance ou variante est requise.'),
  images: z
    .array(
      z.object({
        url: z.string().url(),
        altText: z.string().optional(),
        displayOrder: z.number().int().default(0),
        isPrimary: z.boolean().default(false),
      })
    )
    .default([]),
});

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Détail public : slug SEO ou UUID (liens front /product/:id). */
function productDetailWhere(identifier) {
  const key = String(identifier || '').trim();
  if (UUID_REGEX.test(key)) return { id: key };
  return { slug: key.toLowerCase() };
}

function slugifyProductName(name) {
  return (
    String(name || 'produit')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72) || 'produit'
  );
}

/** SKU, slug et prix de base auto si omis (admin). */
async function fillProductCatalogDefaults(data, db = prisma, excludeProductId = null) {
  const nameFr = data.translations?.fr?.name?.trim() || 'Produit';
  const notSelf = excludeProductId ? { NOT: { id: excludeProductId } } : {};

  let slugBase = data.slug?.trim() ? data.slug.trim().toLowerCase() : slugifyProductName(nameFr);
  let slugCandidate = slugBase;
  let slugSuffix = 0;
  while (
    await db.product.findFirst({
      where: { slug: slugCandidate, ...notSelf },
    })
  ) {
    slugSuffix += 1;
    slugCandidate = `${slugBase}-${slugSuffix}`;
  }
  data.slug = slugCandidate;

  let skuBase = data.sku?.trim()
    ? data.sku.trim().toUpperCase()
    : slugCandidate.replace(/-/g, '_').toUpperCase().slice(0, 48);
  let skuCandidate = skuBase;
  let skuSuffix = 0;
  while (
    await db.product.findFirst({
      where: { sku: skuCandidate, ...notSelf },
    })
  ) {
    skuSuffix += 1;
    skuCandidate = `${skuBase.slice(0, 40)}_${skuSuffix}`;
  }
  data.sku = skuCandidate;

  const defaultVariant = data.variants?.find((v) => v.isDefault) || data.variants?.[0];
  const parsedBase = Number(data.basePrice);
  if (data.basePrice == null || data.basePrice === '' || Number.isNaN(parsedBase)) {
    data.basePrice = defaultVariant ? Number(defaultVariant.price) : 0;
  } else {
    data.basePrice = parsedBase;
  }

  if (data.variants?.length) {
    data.variants = data.variants.map((v, idx) => ({
      ...v,
      sku:
        v.sku?.trim()?.toUpperCase() ||
        `${data.sku}-${String(v.volume || idx + 1).replace(/\s+/g, '')}`,
    }));
  }

  return data;
}

export const productController = {
  // GET /api/v1/products (Public catalog with filters, search, and pagination)
  async getProducts(req, res, next) {
    try {
      const { category, badge, minPrice, maxPrice, q, sortBy, page, limit, locale } = req.query;

      const where = {
        status: 'PUBLISHED',
      };

      // Gender category or Category ID/slug filter
      if (category && category !== 'all') {
        const catUpper = category.toUpperCase();
        if (['MEN', 'WOMEN', 'UNISEX'].includes(catUpper)) {
          where.genderCategory = catUpper;
        } else {
          where.category = { slug: category };
        }
      }

      // Badge filter
      if (badge === 'bestSeller') {
        where.isBestSeller = true;
      } else if (badge === 'isNew') {
        where.isNew = true;
      } else if (badge === 'sale') {
        where.salePrice = { not: null };
      }

      // Price filter
      if (minPrice !== undefined || maxPrice !== undefined) {
        where.basePrice = {};
        if (minPrice !== undefined) where.basePrice.gte = minPrice;
        if (maxPrice !== undefined) where.basePrice.lte = maxPrice;
      }

      // Search query across translations (name, description, olfactory notes)
      if (q && q.trim()) {
        const queryTerm = q.trim();
        where.OR = [
          { sku: { contains: queryTerm, mode: 'insensitive' } },
          {
            translations: {
              some: {
                OR: [
                  { name: { contains: queryTerm, mode: 'insensitive' } },
                  { shortDescription: { contains: queryTerm, mode: 'insensitive' } },
                  { fullDescription: { contains: queryTerm, mode: 'insensitive' } },
                  { olfactoryFamily: { contains: queryTerm, mode: 'insensitive' } },
                  { topNotes: { contains: queryTerm, mode: 'insensitive' } },
                  { heartNotes: { contains: queryTerm, mode: 'insensitive' } },
                  { baseNotes: { contains: queryTerm, mode: 'insensitive' } },
                ],
              },
            },
          },
        ];
      }

      // Sorting
      let orderBy = { sortOrder: 'asc' };
      if (sortBy === 'price-asc') orderBy = { basePrice: 'asc' };
      else if (sortBy === 'price-desc') orderBy = { basePrice: 'desc' };
      else if (sortBy === 'newest') orderBy = { createdAt: 'desc' };
      else if (sortBy === 'popularity') orderBy = { isBestSeller: 'desc' };

      const skip = (page - 1) * limit;

      const [totalCount, products] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: {
            translations: { where: { locale } },
            variants: { orderBy: { price: 'asc' } },
            images: { orderBy: { displayOrder: 'asc' } },
            category: {
              include: { translations: { where: { locale } } },
            },
          },
        }),
      ]);

      // Format localized response
      const items = products.map((p) => {
        const translation = p.translations[0] || {};
        const primaryImage = p.images.find((img) => img.isPrimary) || p.images[0] || null;

        return {
          id: p.id,
          sku: p.sku,
          slug: p.slug,
          price: Number(p.basePrice),
          oldPrice: p.salePrice ? Number(p.salePrice) : null,
          currency: p.currency,
          genderCategory: p.genderCategory.toLowerCase(),
          isFeatured: p.isFeatured,
          isBestSeller: p.isBestSeller,
          isNew: p.isNew,
          name: translation.name || p.sku,
          shortDescription: translation.shortDescription || '',
          olfactoryFamily: translation.olfactoryFamily || '',
          image: primaryImage ? primaryImage.url : '',
          images: p.images.map((img) => img.url),
          variants: p.variants.map((v) => ({
            id: v.id,
            volume: v.volume,
            price: Number(v.price),
            oldPrice: v.salePrice ? Number(v.salePrice) : null,
            sku: v.sku,
            inStock: v.stockQuantity > 0,
            stockQuantity: v.stockQuantity,
            isDefault: v.isDefault,
          })),
        };
      });

      res.json({
        success: true,
        data: {
          items,
          pagination: {
            total: totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/products/:slugOrId (Single product detail — slug or UUID)
  async getProductBySlug(req, res, next) {
    try {
      const { slug: slugOrId } = req.params;
      const locale = req.query.locale || 'fr';

      const product = await prisma.product.findUnique({
        where: productDetailWhere(slugOrId),
        include: {
          translations: true, // load all locales so user can switch dynamically
          variants: { orderBy: { price: 'asc' } },
          images: { orderBy: { displayOrder: 'asc' } },
          category: {
            include: { translations: true },
          },
          reviews: {
            where: { status: 'APPROVED' },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!product || product.status !== 'PUBLISHED') {
        return next(new AppError('Produit introuvable.', 404, 'PRODUCT_NOT_FOUND'));
      }

      // Group translations by locale
      const translationsByLocale = {};
      product.translations.forEach((t) => {
        translationsByLocale[t.locale] = t;
      });

      const currentTrans = translationsByLocale[locale] || translationsByLocale['fr'] || {};

      const defaultVariant =
        product.variants.find((v) => v.isDefault) || product.variants[0] || null;

      const formatted = {
        id: product.id,
        sku: product.sku,
        slug: product.slug,
        price: Number(defaultVariant?.price ?? product.basePrice),
        oldPrice: defaultVariant?.salePrice
          ? Number(defaultVariant.salePrice)
          : product.salePrice
            ? Number(product.salePrice)
            : null,
        currency: product.currency,
        genderCategory: product.genderCategory.toLowerCase(),
        isFeatured: product.isFeatured,
        isBestSeller: product.isBestSeller,
        isNew: product.isNew,
        status: product.status,
        name: currentTrans.name || product.sku,
        translations: translationsByLocale,
        shortDescription: currentTrans.shortDescription || '',
        fullDescription: currentTrans.fullDescription || '',
        olfactoryFamily: currentTrans.olfactoryFamily || '',
        topNotes: currentTrans.topNotes ? currentTrans.topNotes.split(',').map((s) => s.trim()) : [],
        heartNotes: currentTrans.heartNotes ? currentTrans.heartNotes.split(',').map((s) => s.trim()) : [],
        baseNotes: currentTrans.baseNotes ? currentTrans.baseNotes.split(',').map((s) => s.trim()) : [],
        usageAdvice: currentTrans.usageAdvice || '',
        image:
          product.images.find((img) => img.isPrimary)?.url ||
          product.images[0]?.url ||
          '',
        images: product.images.map((img) => img.url),
        variants: product.variants.map((v) => ({
          id: v.id,
          volume: v.volume,
          price: Number(v.price),
          oldPrice: v.salePrice ? Number(v.salePrice) : null,
          sku: v.sku,
          inStock: v.stockQuantity > 0,
          stockQuantity: v.stockQuantity,
          isDefault: v.isDefault,
        })),
        reviews: product.reviews.map((r) => ({
          id: r.id,
          authorName: r.authorName,
          rating: r.rating,
          comment: r.comment,
          brandReply: r.brandReply,
          isVerifiedPurchase: r.isVerifiedPurchase,
          createdAt: r.createdAt,
        })),
      };

      res.json({
        success: true,
        data: formatted,
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/products/featured
  async getFeatured(req, res, next) {
    try {
      const locale = req.query.locale || 'fr';
      const limit = Number(req.query.limit) || 4;

      const products = await prisma.product.findMany({
        where: { isFeatured: true, status: 'PUBLISHED' },
        take: limit,
        include: {
          translations: { where: { locale } },
          variants: { orderBy: { price: 'asc' } },
          images: { orderBy: { displayOrder: 'asc' } },
        },
      });

      const formatted = products.map((p) => {
        const trans = p.translations[0] || {};
        return {
          id: p.id,
          slug: p.slug,
          name: trans.name || p.sku,
          price: Number(p.basePrice),
          oldPrice: p.salePrice ? Number(p.salePrice) : null,
          image: p.images[0]?.url || '',
          genderCategory: p.genderCategory.toLowerCase(),
          isFeatured: p.isFeatured,
          isBestSeller: p.isBestSeller,
          isNew: p.isNew,
          variants: p.variants.map((v) => ({
            volume: v.volume,
            price: Number(v.price),
          })),
        };
      });

      res.json({ success: true, data: formatted });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: GET /api/v1/admin/products
  async adminGetProducts(req, res, next) {
    try {
      const { q, status, page = 1, limit = 20 } = req.query;

      const where = {};
      if (status && status !== 'ALL') where.status = status;
      if (q && q.trim()) {
        where.OR = [
          { sku: { contains: q.trim(), mode: 'insensitive' } },
          { slug: { contains: q.trim(), mode: 'insensitive' } },
          { translations: { some: { name: { contains: q.trim(), mode: 'insensitive' } } } },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [total, products] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: 'desc' },
          include: {
            translations: true,
            variants: true,
            images: { orderBy: { displayOrder: 'asc' } },
          },
        }),
      ]);

      const items = products.map((p) => {
        const totalStock = p.variants.reduce((sum, v) => sum + v.stockQuantity, 0);
        const nameFr = p.translations.find((t) => t.locale === 'fr')?.name || p.sku;
        return {
          id: p.id,
          sku: p.sku,
          slug: p.slug,
          name: nameFr,
          basePrice: Number(p.basePrice),
          salePrice: p.salePrice ? Number(p.salePrice) : null,
          status: p.status,
          genderCategory: p.genderCategory,
          totalStock,
          variantsCount: p.variants.length,
          image: p.images[0]?.url || null,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
      });

      res.json({
        success: true,
        data: {
          items,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: GET /api/v1/admin/products/:id
  async adminGetProductById(req, res, next) {
    try {
      const { id } = req.params;
      const product = await prisma.product.findUnique({
        where: { id },
        include: {
          translations: true,
          variants: { orderBy: { price: 'asc' } },
          images: { orderBy: { displayOrder: 'asc' } },
        },
      });

      if (!product) {
        return next(new AppError('Produit introuvable.', 404, 'PRODUCT_NOT_FOUND'));
      }

      const translations = { fr: {}, en: {}, ar: {} };
      for (const t of product.translations) {
        translations[t.locale] = {
          name: t.name || '',
          shortDescription: t.shortDescription || '',
          fullDescription: t.fullDescription || '',
          olfactoryFamily: t.olfactoryFamily || '',
          topNotes: t.topNotes || '',
          heartNotes: t.heartNotes || '',
          baseNotes: t.baseNotes || '',
          usageAdvice: t.usageAdvice || '',
        };
      }

      res.json({
        success: true,
        data: {
          id: product.id,
          sku: product.sku,
          slug: product.slug,
          basePrice: Number(product.basePrice),
          salePrice: product.salePrice ? Number(product.salePrice) : null,
          genderCategory: product.genderCategory,
          status: product.status,
          isFeatured: product.isFeatured,
          isBestSeller: product.isBestSeller,
          isNew: product.isNew,
          categoryId: product.categoryId,
          translations,
          variants: product.variants.map((v) => ({
            id: v.id,
            volume: v.volume,
            price: Number(v.price),
            salePrice: v.salePrice ? Number(v.salePrice) : null,
            sku: v.sku,
            stockQuantity: v.stockQuantity,
            isDefault: v.isDefault,
          })),
          images: product.images.map((img) => ({
            id: img.id,
            url: img.url,
            isPrimary: img.isPrimary,
            displayOrder: img.displayOrder,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: POST /api/v1/admin/products
  async adminCreateProduct(req, res, next) {
    try {
      const data = req.body;
      await fillProductCatalogDefaults(data);

      // Execute transaction for product, translations, variants and images
      const created = await prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            sku: data.sku,
            slug: data.slug,
            basePrice: data.basePrice,
            salePrice: data.salePrice,
            genderCategory: data.genderCategory,
            categoryId: data.categoryId,
            isFeatured: data.isFeatured,
            isBestSeller: data.isBestSeller,
            isNew: data.isNew,
            status: data.status,
            translations: {
              create: Object.entries(data.translations).map(([locale, trans]) => ({
                locale,
                name: trans.name,
                shortDescription: trans.shortDescription,
                fullDescription: trans.fullDescription,
                olfactoryFamily: trans.olfactoryFamily,
                topNotes: trans.topNotes,
                heartNotes: trans.heartNotes,
                baseNotes: trans.baseNotes,
                usageAdvice: trans.usageAdvice,
              })),
            },
            variants: {
              create: data.variants.map((v) => ({
                volume: v.volume,
                price: v.price,
                salePrice: v.salePrice,
                sku: v.sku,
                stockQuantity: v.stockQuantity,
                alertThreshold: v.alertThreshold,
                isDefault: v.isDefault,
              })),
            },
            images: {
              create: data.images.map((img, idx) => ({
                url: img.url,
                altText: img.altText,
                displayOrder: img.displayOrder !== undefined ? img.displayOrder : idx,
                isPrimary: img.isPrimary || idx === 0,
              })),
            },
          },
          include: {
            translations: true,
            variants: true,
            images: true,
          },
        });

        // Record initial inventory movements
        for (const variant of product.variants) {
          if (variant.stockQuantity > 0) {
            await tx.inventoryMovement.create({
              data: {
                productId: product.id,
                variantId: variant.id,
                type: 'IN',
                quantity: variant.stockQuantity,
                beforeQty: 0,
                afterQty: variant.stockQuantity,
                reason: 'Stock initial lors de la création du produit',
                userId: req.user.id,
              },
            });
          }
        }

        return product;
      });

      await logAuditAction(req, 'CREATE_PRODUCT', 'Product', created.id, { sku: created.sku, slug: created.slug });

      res.status(201).json({
        success: true,
        message: 'Produit créé avec succès.',
        data: created,
      });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: PUT /api/v1/admin/products/:id
  async adminUpdateProduct(req, res, next) {
    try {
      const { id } = req.params;
      const data = req.body;

      const existing = await prisma.product.findUnique({
        where: { id },
        include: { variants: true, translations: true, images: true },
      });

      if (!existing) {
        return next(new AppError('Produit introuvable.', 404, 'PRODUCT_NOT_FOUND'));
      }

      await fillProductCatalogDefaults(data, prisma, id);

      await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id },
          data: {
            sku: data.sku,
            slug: data.slug,
            basePrice: data.basePrice,
            salePrice: data.salePrice,
            genderCategory: data.genderCategory,
            categoryId: data.categoryId ?? null,
            isFeatured: data.isFeatured,
            isBestSeller: data.isBestSeller,
            isNew: data.isNew,
            status: data.status,
          },
        });

        if (data.translations) {
          for (const [locale, trans] of Object.entries(data.translations)) {
            await tx.productTranslation.upsert({
              where: { productId_locale: { productId: id, locale } },
              create: {
                productId: id,
                locale,
                name: trans.name,
                shortDescription: trans.shortDescription,
                fullDescription: trans.fullDescription,
                olfactoryFamily: trans.olfactoryFamily,
                topNotes: trans.topNotes,
                heartNotes: trans.heartNotes,
                baseNotes: trans.baseNotes,
                usageAdvice: trans.usageAdvice,
              },
              update: {
                name: trans.name,
                shortDescription: trans.shortDescription,
                fullDescription: trans.fullDescription,
                olfactoryFamily: trans.olfactoryFamily,
                topNotes: trans.topNotes,
                heartNotes: trans.heartNotes,
                baseNotes: trans.baseNotes,
                usageAdvice: trans.usageAdvice,
              },
            });
          }
        }

        if (Array.isArray(data.variants)) {
          const existingIds = new Set(existing.variants.map((v) => v.id));
          const keptIds = new Set();

          for (const v of data.variants) {
            const variantPayload = {
              volume: v.volume,
              price: Number(v.price),
              salePrice: v.salePrice != null && v.salePrice !== '' ? Number(v.salePrice) : null,
              sku: v.sku?.trim()?.toUpperCase() || `${data.sku}-${v.volume}`,
              stockQuantity: Number(v.stockQuantity) || 0,
              isDefault: Boolean(v.isDefault),
            };

            if (v.id && existingIds.has(v.id)) {
              keptIds.add(v.id);
              await tx.productVariant.update({
                where: { id: v.id },
                data: variantPayload,
              });
            } else {
              await tx.productVariant.create({
                data: { productId: id, ...variantPayload },
              });
            }
          }

          for (const old of existing.variants) {
            if (!keptIds.has(old.id)) {
              const orderLine = await tx.orderItem.count({ where: { variantId: old.id } });
              if (orderLine === 0) {
                await tx.productVariant.delete({ where: { id: old.id } });
              }
            }
          }
        }

        if (Array.isArray(data.images)) {
          await tx.productImage.deleteMany({ where: { productId: id } });
          const images = data.images.filter((img) => img.url?.trim());
          if (images.length) {
            const hasPrimary = images.some((img) => img.isPrimary);
            await tx.productImage.createMany({
              data: images.map((img, idx) => ({
                productId: id,
                url: img.url.trim(),
                altText: img.altText || null,
                displayOrder: img.displayOrder ?? idx,
                isPrimary: hasPrimary ? Boolean(img.isPrimary) : idx === 0,
              })),
            });
          }
        }
      });

      await logAuditAction(req, 'UPDATE_PRODUCT', 'Product', id);

      res.json({
        success: true,
        message: 'Produit mis à jour avec succès.',
      });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: POST /api/v1/admin/inventory/movement
  async adminAdjustStock(req, res, next) {
    try {
      const { variantId, quantityChange, reason, type = 'ADJUSTMENT' } = req.body;

      if (!variantId || quantityChange === undefined || !reason) {
        return next(new AppError('variantId, quantityChange et reason sont requis.', 400));
      }

      const variant = await prisma.productVariant.findUnique({
        where: { id: variantId },
      });

      if (!variant) {
        return next(new AppError('Variante de produit introuvable.', 404));
      }

      const beforeQty = variant.stockQuantity;
      const afterQty = beforeQty + Number(quantityChange);

      if (afterQty < 0) {
        return next(new AppError('Le stock résultant ne peut pas être négatif.', 400));
      }

      await prisma.$transaction([
        prisma.productVariant.update({
          where: { id: variantId },
          data: { stockQuantity: afterQty },
        }),
        prisma.inventoryMovement.create({
          data: {
            productId: variant.productId,
            variantId: variant.id,
            type,
            quantity: Number(quantityChange),
            beforeQty,
            afterQty,
            reason,
            userId: req.user.id,
          },
        }),
      ]);

      await logAuditAction(req, 'STOCK_ADJUSTMENT', 'ProductVariant', variantId, {
        beforeQty,
        afterQty,
        reason,
      });

      res.json({
        success: true,
        message: 'Mouvement de stock enregistré avec succès.',
        data: { beforeQty, afterQty, difference: quantityChange },
      });
    } catch (err) {
      next(err);
    }
  },
};
