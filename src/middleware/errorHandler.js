import { ZodError } from 'zod';
import { env } from '../config/env.js';

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Ressource non trouvée: ${req.method} ${req.originalUrl}`,
    },
  });
};

export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'Une erreur interne est survenue.';
  let details = null;

  // Handle Zod Validation Error
  if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Données de requête invalides.';
    details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
  }

  // Handle Prisma Known Request Errors
  if (err.code === 'P2002') {
    statusCode = 409;
    code = 'CONFLICT';
    const target = err.meta?.target ? ` (${err.meta.target})` : '';
    message = `Un enregistrement avec cette valeur existe déjà${target}.`;
  } else if (err.code === 'P2025') {
    statusCode = 404;
    code = 'NOT_FOUND';
    message = 'La ressource demandée est introuvable.';
  }

  if (err.name === 'MulterError') {
    statusCode = 400;
    code = 'UPLOAD_ERROR';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Fichier trop volumineux (maximum 5 Mo par image).';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Trop de fichiers envoyés en une seule fois.';
    } else {
      message = err.message || 'Erreur lors du téléversement.';
    }
  } else if (err.message && err.message.includes('Type de fichier non autorisé')) {
    statusCode = 400;
    code = 'INVALID_FILE_TYPE';
    message = err.message;
  }

  // Handle JWT Errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Jeton d\'authentification invalide.';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Le jeton d\'authentification a expiré.';
  }

  // Log server errors (avoid logging sensitive credentials)
  if (statusCode >= 500) {
    console.error(`[SERVER ERROR] ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      ...(env.NODE_ENV === 'development' && statusCode >= 500 ? { stack: err.stack } : {}),
    },
  });
};
