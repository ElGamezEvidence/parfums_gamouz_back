import { env } from '../config/env.js';

/** URL publique de base pour les fichiers uploadés (sans /api/v1). */
export function getPublicApiBaseUrl(req) {
  if (env.PUBLIC_API_URL) {
    return env.PUBLIC_API_URL.replace(/\/$/, '');
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  if (req) {
    return `${req.protocol}://${req.get('host')}`;
  }
  return `http://localhost:${env.PORT}`;
}
