import app from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/db.js';
import { provisionInitialAdmin } from './services/provisionAdmin.js';

async function bootstrap() {
  if (env.DATABASE_URL) {
    try {
      await provisionInitialAdmin();
    } catch (err) {
      console.error('[provision] Échec du provisionnement administrateur :', err.message);
    }
  }

  return app.listen(env.PORT, () => {
    console.log('====================================================');
    console.log(`  GAAMOUZE REST API RUNNING ON PORT ${env.PORT}`);
    console.log(`  Environment: ${env.NODE_ENV}`);
    console.log(`  Health Check: http://localhost:${env.PORT}/api/v1/health`);
    console.log(`  API Docs: http://localhost:${env.PORT}/api/v1/docs`);
    console.log(`  Frontend CORS Origin: ${env.FRONTEND_URL}`);
    console.log('====================================================');
  });
}

const server = await bootstrap();

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\nReçu ${signal}. Fermeture gracieuse du serveur GAAMOUZE...`);
  server.close(async () => {
    console.log('Serveur HTTP fermé.');
    try {
      await prisma.$disconnect();
      console.log('Connexions Prisma/PostgreSQL fermées avec succès.');
    } catch (err) {
      console.error('Erreur lors de la déconnexion de la base :', err);
    }
    process.exit(0);
  });

  // Force shutdown after 10s if stuck
  setTimeout(() => {
    console.error('Arrêt forcé après délai dépassé.');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export default server;
