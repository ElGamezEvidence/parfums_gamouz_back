import { prisma } from '../config/db.js';
import { env } from '../config/env.js';

export const healthController = {
  // GET /api/v1/health
  async check(req, res) {
    const startTime = Date.now();
    let dbStatus = 'DISCONNECTED';
    let dbLatencyMs = null;

    try {
      const dbPingStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - dbPingStart;
      dbStatus = 'CONNECTED';
    } catch (err) {
      dbStatus = `ERROR: ${err.message}`;
    }

    const memoryUsage = process.memoryUsage();

    const isHealthy = dbStatus === 'CONNECTED';

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'HEALTHY' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: env.NODE_ENV,
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        provider: 'Neon PostgreSQL',
      },
      system: {
        nodeVersion: process.version,
        memoryRssMb: Math.round(memoryUsage.rss / (1024 * 1024)),
        heapUsedMb: Math.round(memoryUsage.heapUsed / (1024 * 1024)),
      },
      responseTimeMs: Date.now() - startTime,
    });
  },
};
