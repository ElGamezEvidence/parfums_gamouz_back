import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { hashPassword } from '../utils/security.js';

/**
 * Idempotent initial SUPER_ADMIN provisioning.
 * Never resets password for an existing administrator.
 */
export async function provisionInitialAdmin() {
  if (!env.DATABASE_URL) {
    console.warn('[provision] DATABASE_URL absente — provisionnement admin ignoré.');
    return;
  }

  const email = env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!email) {
    console.warn('[provision] ADMIN_EMAIL non défini — provisionnement admin ignoré.');
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return;
  }

  if (!env.ADMIN_INITIAL_PASSWORD) {
    console.warn(
      `[provision] Aucun compte admin pour ${email}. Définissez ADMIN_INITIAL_PASSWORD puis redémarrez, ou exécutez npm run prisma:seed.`
    );
    return;
  }

  const passwordHash = await hashPassword(env.ADMIN_INITIAL_PASSWORD);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: 'Abdelali',
      lastName: 'Gamouz',
      phone: '+212671545193',
      role: 'SUPER_ADMIN',
      mustChangePassword: true,
      isActive: true,
    },
  });

  console.log(`[provision] Compte SUPER_ADMIN créé pour ${email} (changement de mot de passe requis).`);
}
