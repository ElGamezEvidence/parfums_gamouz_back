import { prisma } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditAction } from '../middleware/audit.js';

export const contentController = {
  // GET /api/v1/content/home (Public homepage editorial blocks)
  async getHomeContent(req, res, next) {
    try {
      const locale = req.query.locale || 'fr';

      const contents = await prisma.siteContent.findMany({
        where: { isPublished: true },
      });

      const banners = await prisma.banner.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });

      const parsedContents = {};
      contents.forEach((item) => {
        try {
          const json = JSON.parse(item.contentJson);
          parsedContents[item.key] = json[locale] || json['fr'] || json;
        } catch {
          parsedContents[item.key] = item.contentJson;
        }
      });

      res.json({
        success: true,
        data: {
          sections: parsedContents,
          banners,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/settings/public
  async getPublicSettings(req, res, next) {
    try {
      const settings = await prisma.siteSetting.findMany({
        where: {
          key: {
            in: [
              'shipping_free_threshold',
              'shipping_standard_fee',
              'contact_whatsapp',
              'contact_phone',
              'contact_email',
              'site_slogan_fr',
              'site_slogan_en',
              'site_slogan_ar',
            ],
          },
        },
      });

      const dict = {};
      settings.forEach((s) => {
        dict[s.key] = s.value;
      });

      res.json({
        success: true,
        data: dict,
      });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: GET /api/v1/admin/content
  async adminGetContents(req, res, next) {
    try {
      const contents = await prisma.siteContent.findMany({
        orderBy: { updatedAt: 'desc' },
      });
      res.json({ success: true, data: contents });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: PUT /api/v1/admin/content/:key
  async adminUpdateContent(req, res, next) {
    try {
      const { key } = req.params;
      const { contentJson, isPublished, section } = req.body;

      const updated = await prisma.siteContent.upsert({
        where: { key },
        create: {
          key,
          section: section || 'general',
          contentJson: typeof contentJson === 'string' ? contentJson : JSON.stringify(contentJson),
          isPublished: isPublished !== undefined ? isPublished : true,
        },
        update: {
          contentJson: typeof contentJson === 'string' ? contentJson : JSON.stringify(contentJson),
          ...(isPublished !== undefined ? { isPublished } : {}),
        },
      });

      await logAuditAction(req, 'UPDATE_SITE_CONTENT', 'SiteContent', key);

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: GET /api/v1/admin/settings
  async adminGetSettings(req, res, next) {
    try {
      const settings = await prisma.siteSetting.findMany({
        orderBy: { key: 'asc' },
      });
      res.json({ success: true, data: settings });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: PUT /api/v1/admin/settings/:key
  async adminUpdateSetting(req, res, next) {
    try {
      const { key } = req.params;
      const { value, description } = req.body;

      const updated = await prisma.siteSetting.upsert({
        where: { key },
        create: { key, value: String(value), description },
        update: { value: String(value), ...(description ? { description } : {}) },
      });

      await logAuditAction(req, 'UPDATE_SITE_SETTING', 'SiteSetting', key, { value });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
};
