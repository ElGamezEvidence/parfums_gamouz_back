/**
 * Réinitialise le mot de passe SUPER_ADMIN (idempotent).
 * Usage: définir ADMIN_EMAIL et ADMIN_INITIAL_PASSWORD dans .env, puis npm run admin:reset-password
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const email = (process.env.ADMIN_EMAIL || 'abdelaligamouz@1448').toLowerCase().trim();
const password = process.env.ADMIN_INITIAL_PASSWORD;

if (!password) {
  console.error('ADMIN_INITIAL_PASSWORD manquant dans backend/.env');
  process.exit(1);
}

const { prisma } = await import('../src/config/db.js');
const passwordHash = await bcrypt.hash(password, 12);

const existing = await prisma.user.findUnique({ where: { email } });

if (existing) {
  await prisma.user.update({
    where: { email },
    data: {
      passwordHash,
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      isActive: true,
      role: 'SUPER_ADMIN',
    },
  });
  console.log(`[OK] Mot de passe mis à jour pour ${email}`);
} else {
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: 'Abdelali',
      lastName: 'Gamouz',
      role: 'SUPER_ADMIN',
      mustChangePassword: false,
      isActive: true,
    },
  });
  console.log(`[OK] Compte SUPER_ADMIN créé : ${email}`);
}

await prisma.$disconnect();
