import { verifyToken } from '../utils/security.js';
import { prisma } from '../config/db.js';
import { AppError } from './errorHandler.js';

export const authenticateToken = async (req, res, next) => {
  try {
    let token = null;

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.gamouze_access_token) {
      token = req.cookies.gamouze_access_token;
    }

    if (!token) {
      return next(new AppError('Authentification requise pour accéder à cette ressource.', 401, 'UNAUTHORIZED'));
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.id) {
      return next(new AppError('Jeton invalide ou expiré.', 401, 'INVALID_TOKEN'));
    }

    // Verify user exists and is active in database
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        isActive: true,
        mustChangePassword: true,
        lockedUntil: true,
      },
    });

    if (!user) {
      return next(new AppError('Utilisateur introuvable.', 401, 'USER_NOT_FOUND'));
    }

    if (!user.isActive) {
      return next(new AppError('Ce compte a été désactivé.', 403, 'ACCOUNT_DISABLED'));
    }

    if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      return next(
        new AppError(
          'Compte temporairement verrouillé pour des raisons de sécurité. Veuillez réessayer plus tard.',
          403,
          'ACCOUNT_LOCKED'
        )
      );
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

export const requirePasswordChanged = (req, res, next) => {
  if (req.user && req.user.mustChangePassword) {
    // Only allow changing password
    if (req.originalUrl.includes('/auth/change-password') || req.originalUrl.includes('/auth/logout')) {
      return next();
    }
    return next(
      new AppError(
        'Vous devez obligatoirement modifier votre mot de passe initial avant d\'accéder à l\'administration.',
        403,
        'PASSWORD_CHANGE_REQUIRED'
      )
    );
  }
  next();
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentification requise.', 401, 'UNAUTHORIZED'));
    }

    // SUPER_ADMIN has full access to everything
    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('Vous ne disposez pas des permissions requises pour cette action.', 403, 'FORBIDDEN')
      );
    }

    next();
  };
};
