/**
 * Applique les migrations Prisma via WebSocket Neon (port 443)
 * lorsque le port PostgreSQL 5432 est bloqué localement (P1001).
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import ws from 'ws';
import { neonConfig, Pool } from '@neondatabase/serverless';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MIGRATION_DIR = path.join(__dirname, '..', 'prisma', 'migrations', '0_init');
const MIGRATION_NAME = '0_init';
const migrationSqlPath = path.join(MIGRATION_DIR, 'migration.sql');

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error('DATABASE_URL manquant dans backend/.env');
  process.exit(1);
}

if (!fs.existsSync(migrationSqlPath)) {
  console.error(`Fichier introuvable : ${migrationSqlPath}`);
  process.exit(1);
}

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: databaseUrl });

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*\r?\n/)
    .map((s) => s.replace(/^\s*--[^\n]*\n?/gm, '').trim())
    .filter(Boolean);
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
  `);
}

async function isMigrationApplied(client, checksum) {
  const res = await client.query(
    `SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1 AND checksum = $2 AND finished_at IS NOT NULL LIMIT 1`,
    [MIGRATION_NAME, checksum]
  );
  return res.rowCount > 0;
}

async function main() {
  const migrationSql = fs.readFileSync(migrationSqlPath, 'utf8');
  const checksum = crypto.createHash('sha256').update(migrationSql).digest('hex');
  const statements = splitSqlStatements(migrationSql);

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    if (await isMigrationApplied(client, checksum)) {
      console.log(`[OK] Migration "${MIGRATION_NAME}" déjà appliquée.`);
      return;
    }

    console.log(`Application de ${statements.length} instructions SQL via Neon WebSocket…`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      try {
        await client.query(stmt);
      } catch (err) {
        if (/already exists|duplicate key/i.test(err.message)) {
          console.warn(`[SKIP] ${i + 1}/${statements.length} : ${err.message.split('\n')[0]}`);
          continue;
        }
        console.error(`[ERREUR] Instruction ${i + 1}/${statements.length}:`, err.message);
        throw err;
      }
    }

    const id = crypto.randomUUID();
    await client.query(
      `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
       VALUES ($1, $2, NOW(), $3, $4)`,
      [id, checksum, MIGRATION_NAME, statements.length]
    );

    console.log(`[OK] Migration "${MIGRATION_NAME}" appliquée avec succès.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Échec migration WebSocket :', err.message);
  process.exit(1);
});
