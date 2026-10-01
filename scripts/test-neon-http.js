import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error('DATABASE_URL manquant');
  process.exit(1);
}

try {
  const sql = neon(url);
  const rows = await sql`SELECT 1 AS ok`;
  console.log('Connexion Neon (HTTP/SQL) OK', rows);
} catch (err) {
  console.error('Connexion Neon HTTP échouée:', err.message);
  process.exit(1);
}
