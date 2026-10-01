import { prisma } from '../config/db.js';

export const collectionController = {
  // GET /api/v1/collections
  async getCollections(req, res, next) {
    try {
      const locale = req.query.locale || 'fr';

      const collections = await prisma.collection.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          translations: { where: { locale } },
          products: {
            include: {
              product: {
                include: {
                  translations: { where: { locale } },
                  images: { orderBy: { displayOrder: 'asc' }, take: 1 },
                  variants: { orderBy: { price: 'asc' }, take: 1 },
                },
              },
            },
          },
        },
      });

      const data = collections.map((col) => {
        const trans = col.translations[0] || {};
        const products = col.products
          .map(({ product: p }) => {
            if (!p || p.status !== 'PUBLISHED') return null;
            const pt = p.translations[0];
            return {
              id: p.id,
              slug: p.slug,
              name: pt?.name || p.sku,
              price: Number(p.basePrice),
              image: p.images[0]?.url || '',
            };
          })
          .filter(Boolean);

        return {
          id: col.id,
          slug: col.slug,
          image: col.image,
          title: trans.title || col.slug,
          subtitle: trans.subtitle || '',
          description: trans.description || '',
          products,
        };
      });

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
