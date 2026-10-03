import fs from 'fs';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { getPublicApiBaseUrl } from '../utils/publicUrl.js';

export function isCloudinaryEnabled() {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
  );
}

function configureCloudinary() {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

/** URL publique durable (Cloudinary) ou locale (dev / volume Railway). */
export async function publishProductImageFile(req, file) {
  if (isCloudinaryEnabled()) {
    configureCloudinary();
    const result = await cloudinary.uploader.upload(file.path, {
      folder: 'gaamouze/products',
      resource_type: 'image',
    });
    try {
      fs.unlinkSync(file.path);
    } catch {
      /* fichier temporaire déjà absent */
    }
    return {
      url: result.secure_url,
      path: result.public_id,
      filename: file.filename,
      size: file.size,
      mimeType: file.mimetype,
      storage: 'cloudinary',
    };
  }

  if (env.NODE_ENV === 'production') {
    console.warn(
      '[GAAMOUZE media] Production sans Cloudinary : préférez CLOUDINARY_* ou un volume Railway sur /app/uploads.'
    );
  }

  const publicBase = getPublicApiBaseUrl(req);
  const relativePath = `/uploads/products/${file.filename}`;
  return {
    url: `${publicBase}${relativePath}`,
    path: relativePath,
    filename: file.filename,
    size: file.size,
    mimeType: file.mimetype,
    storage: 'local',
  };
}
