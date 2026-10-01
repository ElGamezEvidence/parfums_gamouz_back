import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { prisma } = await import('../src/config/db.js');

try {
  await prisma.$queryRaw`SELECT 1 AS ok`;
  console.log('Connexion PostgreSQL OK (Prisma + Neon WebSocket si applicable)');
} catch (err) {
  console.error('Connexion échouée:', err.code || err.name, err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
