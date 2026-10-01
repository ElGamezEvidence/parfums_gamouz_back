import path from 'path';
import fs from 'fs';
import { getPublicApiBaseUrl } from '../utils/publicUrl.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditAction } from '../middleware/audit.js';
import { UPLOAD_DIR } from '../middleware/upload.js';

export const mediaController = {
  /** POST /api/v1/admin/media/upload — fichier unique (champ "image") */
  async uploadProductImage(req, res, next) {
    try {
      if (!req.file) {
        return next(new AppError('Aucun fichier image reçu.', 400, 'NO_FILE'));
      }

      const publicBase = getPublicApiBaseUrl(req);
      const relativePath = `/uploads/products/${req.file.filename}`;
      const publicUrl = `${publicBase}${relativePath}`;

      await logAuditAction(req, 'UPLOAD_PRODUCT_IMAGE', 'Media', req.file.filename, {
        size: req.file.size,
        mime: req.file.mimetype,
      });

      res.status(201).json({
        success: true,
        data: {
          url: publicUrl,
          path: relativePath,
          filename: req.file.filename,
          size: req.file.size,
          mimeType: req.file.mimetype,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/v1/admin/media/upload-many — plusieurs fichiers (champ "images") */
  async uploadProductImages(req, res, next) {
    try {
      const files = req.files || [];
      if (!files.length) {
        return next(new AppError('Aucun fichier image reçu.', 400, 'NO_FILE'));
      }

      const publicBase = getPublicApiBaseUrl(req);
      const uploaded = files.map((file) => {
        const relativePath = `/uploads/products/${file.filename}`;
        return {
          url: `${publicBase}${relativePath}`,
          path: relativePath,
          filename: file.filename,
          size: file.size,
          mimeType: file.mimetype,
        };
      });

      await logAuditAction(req, 'UPLOAD_PRODUCT_IMAGES', 'Media', null, {
        count: uploaded.length,
      });

      res.status(201).json({
        success: true,
        data: { items: uploaded },
      });
    } catch (err) {
      next(err);
    }
  },

  /** DELETE /api/v1/admin/media/product/:filename */
  async deleteProductImage(req, res, next) {
    try {
      const raw = req.params.filename || '';
      const filename = path.basename(raw);
      if (!filename || filename.includes('..')) {
        return next(new AppError('Nom de fichier invalide.', 400, 'INVALID_FILENAME'));
      }

      const fullPath = path.join(UPLOAD_DIR, filename);
      if (!fullPath.startsWith(UPLOAD_DIR)) {
        return next(new AppError('Chemin refusé.', 400, 'INVALID_PATH'));
      }

      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }

      await logAuditAction(req, 'DELETE_PRODUCT_IMAGE', 'Media', filename);

      res.json({ success: true, message: 'Image supprimée.' });
    } catch (err) {
      next(err);
    }
  },
};
