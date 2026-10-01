import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env.js';
import swaggerUi from 'swagger-ui-express';
import apiRouter from './routes/index.js';
import { openApiDocument } from './docs/openapi.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Trust proxy for Railway / reverse proxy deployment
app.set('trust proxy', 1);

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows flexible integration with static frontends
    crossOriginEmbedderPolicy: false,
  })
);

// Strict CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      if (
        env.CORS_ORIGIN.includes('*') ||
        env.CORS_ORIGIN.includes(origin) ||
        origin.startsWith('http://localhost')
      ) {
        callback(null, true);
      } else {
        callback(new Error(`Origine CORS non autorisée : ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'idempotency-key'],
  })
);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Request Logger in dev mode
if (env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Fichiers uploadés (images produits) — stockage local ; Cloudinary optionnel en production
app.use(
  '/uploads',
  express.static(path.join(__dirname, '..', 'uploads'), {
    maxAge: env.NODE_ENV === 'production' ? '7d' : 0,
    fallthrough: true,
  })
);

// Global Rate Limiting on API
app.use('/api', globalLimiter);

// Root greeting / health redirect
app.get('/', (req, res) => {
  res.json({
    name: 'GAAMOUZE E-Commerce API',
    version: '1.0.0',
    documentation: '/api/v1/docs',
    status: 'ONLINE',
  });
});

// OpenAPI documentation
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { explorer: true }));
app.get('/api/v1/openapi.json', (req, res) => {
  res.json(openApiDocument);
});

// Mount versioned API routes
app.use('/api/v1', apiRouter);

// 404 Handler
app.use(notFoundHandler);

// Centralized Error Handler
app.use(errorHandler);

export default app;
