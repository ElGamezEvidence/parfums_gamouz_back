import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { env } from './env.js';

function createPrismaClient() {
  const log =
    env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'];

  const useNeonWebSocket =
    env.DATABASE_URL.includes('neon.tech') || process.env.PRISMA_NEON_WS === '1';

  if (useNeonWebSocket && env.DATABASE_URL) {
    neonConfig.webSocketConstructor = ws;
    const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL });
    return new PrismaClient({ adapter, log });
  }

  return new PrismaClient({ log });
}

let prisma;

if (!global.__prismaInstance) {
  global.__prismaInstance = createPrismaClient();
}

prisma = global.__prismaInstance;

export { prisma };
export default prisma;
