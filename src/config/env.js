import dotenv from 'dotenv';

dotenv.config();

function requireInProduction(value, name) {
  if (process.env.NODE_ENV === 'production' && !value) {
    throw new Error(`Variable d'environnement obligatoire manquante en production : ${name}`);
  }
  return value;
}

const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || '';

requireInProduction(process.env.DATABASE_URL, 'DATABASE_URL');
requireInProduction(JWT_SECRET, 'JWT_SECRET');

if (NODE_ENV === 'production' && JWT_SECRET && JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET doit comporter au moins 32 caractères en production.');
}

export const env = {
  PORT: process.env.PORT || 3000,
  NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL || '',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  CORS_ORIGIN: (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim()),
  JWT_SECRET: JWT_SECRET || 'dev-only-jwt-secret-change-me-not-for-production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || undefined,
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || 'abdelaligamouz@1448').toLowerCase().trim(),
  ADMIN_INITIAL_PASSWORD: process.env.ADMIN_INITIAL_PASSWORD || '',
  /** URL publique du backend (sans /api/v1) — URLs des images uploadées */
  PUBLIC_API_URL: (process.env.PUBLIC_API_URL || '').replace(/\/$/, ''),
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
};
