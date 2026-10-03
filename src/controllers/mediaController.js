import path from 'path';
import fs from 'fs';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditAction } from '../middleware/audit.js';
import { UPLOAD_DIR } from '../middleware/upload.js';
import { publishProductImageFile } from '../services/imageStorage.js';

export const mediaController = {
  /** POST /api/v1/admin/media/upload — fichier unique (champ "image") */
  async uploadProductImage(req, res, next) {
    try {
      if (!req.file) {
        return next(new AppError('Aucun fichier image reçu.', 400, 'NO_FILE'));
      }

      const published = await publishProductImageFile(req, req.file);

      await logAuditAction(req, 'UPLOAD_PRODUCT_IMAGE', 'Media', req.file.filename, {
        size: req.file.size,
        mime: req.file.mimetype,
        storage: published.storage,
      });

      res.status(201).json({
        success: true,
        data: published,
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

      const uploaded = [];
      for (const file of files) {
        uploaded.push(await publishProductImageFile(req, file));
      }

      await logAuditAction(req, 'UPLOAD_PRODUCT_IMAGES', 'Media', null, {
        count: uploaded.length,
        storage: uploaded[0]?.storage,
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
