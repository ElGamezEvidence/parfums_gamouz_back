import { z } from 'zod';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  generateRandomToken,
  hashToken,
  validatePasswordStrength,
  verifyToken,
} from '../utils/security.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditAction } from '../middleware/audit.js';
import { loginIdentifierSchema, strictEmailSchema } from '../utils/validation.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
  domain: env.COOKIE_DOMAIN || undefined,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export const registerSchema = z.object({
  email: strictEmailSchema,
  password: z.string().min(8, 'Le mot de passe doit comporter au moins 8 caractères.'),
  firstName: z.string().min(2, 'Le prénom est requis.').trim(),
  lastName: z.string().min(2, 'Le nom est requis.').trim(),
  phone: z.string().optional(),
});

export const loginSchema = z.object({
  email: loginIdentifierSchema,
  password: z.string().min(1, 'Le mot de passe est obligatoire.'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Le mot de passe actuel est requis.'),
    newPassword: z.string().min(8, 'Le nouveau mot de passe doit comporter au moins 8 caractères.'),
    confirmNewPassword: z.string().min(1, 'La confirmation du mot de passe est requise.'),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'La confirmation ne correspond pas au nouveau mot de passe.',
    path: ['confirmNewPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: loginIdentifierSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Le jeton de réinitialisation est requis.'),
  newPassword: z.string().min(8, 'Le nouveau mot de passe doit comporter au moins 8 caractères.'),
});

export const authController = {
  // POST /api/v1/auth/register (Client registration)
  async register(req, res, next) {
    try {
      const { email, password, firstName, lastName, phone } = req.body;

      const strengthCheck = validatePasswordStrength(password);
      if (!strengthCheck.valid) {
        return next(new AppError(strengthCheck.message, 400, 'WEAK_PASSWORD'));
      }

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return next(new AppError('Cette adresse email est déjà utilisée.', 409, 'EMAIL_EXISTS'));
      }

      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          phone: phone || null,
          role: 'CUSTOMER', // Strict: customers cannot self-assign any other role
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          createdAt: true,
        },
      });

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      // Save refresh session in DB
      await prisma.refreshSession.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(refreshToken),
          userAgent: req.headers['user-agent'] || null,
          ipAddress: req.ip || null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      res.cookie('gamouze_access_token', accessToken, COOKIE_OPTIONS);

      res.status(201).json({
        success: true,
        data: {
          user,
          accessToken,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/auth/login
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      const user = await prisma.user.findUnique({
        where: { email },
      });

      // Generic authentication failure message (prevents account enumeration)
      const invalidCredentialsError = new AppError('Identifiants de connexion invalides.', 401, 'INVALID_CREDENTIALS');

      if (!user) {
        return next(invalidCredentialsError);
      }

      // Check account lock
      if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        const remainingMinutes = Math.ceil((new Date(user.lockedUntil) - new Date()) / (60 * 1000));
        return next(
          new AppError(
            `Compte temporairement verrouillé suite à plusieurs tentatives échouées. Réessayez dans ${remainingMinutes} minute(s).`,
            403,
            'ACCOUNT_LOCKED'
          )
        );
      }

      if (!user.isActive) {
        return next(new AppError('Ce compte a été désactivé.', 403, 'ACCOUNT_DISABLED'));
      }

      const isMatch = await comparePassword(password, user.passwordHash);

      if (!isMatch) {
        // Increment failed attempts and lock if >= 5
        const failedAttempts = user.failedLoginAttempts + 1;
        const lockUpdates = { failedLoginAttempts: failedAttempts };

        if (failedAttempts >= 5) {
          lockUpdates.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins lock
          lockUpdates.failedLoginAttempts = 0;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: lockUpdates,
        });

        return next(invalidCredentialsError);
      }

      // Successful login: reset failed attempts & update lastLoginAt
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        },
      });

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);

      // Save refresh session in DB
      await prisma.refreshSession.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(refreshToken),
          userAgent: req.headers['user-agent'] || null,
          ipAddress: req.ip || null,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      res.cookie('gamouze_access_token', accessToken, COOKIE_OPTIONS);

      await logAuditAction(req, 'USER_LOGIN', 'User', user.id, { email: user.email, role: user.role });

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            mustChangePassword: user.mustChangePassword,
          },
          accessToken,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/auth/logout
  async logout(req, res, next) {
    try {
      if (req.user) {
        // Revoke active sessions for user on this device
        await prisma.refreshSession.updateMany({
          where: { userId: req.user.id, isRevoked: false },
          data: { isRevoked: true },
        });
        await logAuditAction(req, 'USER_LOGOUT', 'User', req.user.id);
      }

      res.clearCookie('gamouze_access_token', COOKIE_OPTIONS);

      res.json({
        success: true,
        message: 'Déconnexion effectuée avec succès.',
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/auth/change-password
  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        return next(new AppError('Utilisateur introuvable.', 404, 'USER_NOT_FOUND'));
      }

      const isCurrentValid = await comparePassword(currentPassword, user.passwordHash);
      if (!isCurrentValid) {
        return next(new AppError('Le mot de passe actuel est incorrect.', 400, 'INVALID_CURRENT_PASSWORD'));
      }

      if (currentPassword === newPassword) {
        return next(
          new AppError('Le nouveau mot de passe doit être différent de l\'ancien.', 400, 'SAME_PASSWORD')
        );
      }

      const strengthCheck = validatePasswordStrength(newPassword);
      if (!strengthCheck.valid) {
        return next(new AppError(strengthCheck.message, 400, 'WEAK_PASSWORD'));
      }

      const newPasswordHash = await hashPassword(newPassword);

      await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: newPasswordHash,
          mustChangePassword: false, // Mandatory password change fulfilled!
        },
      });

      // Revoke all prior refresh sessions for safety
      await prisma.refreshSession.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true },
      });

      await logAuditAction(req, 'PASSWORD_CHANGE', 'User', userId);

      res.json({
        success: true,
        message: 'Mot de passe modifié avec succès.',
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/auth/forgot-password
  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      const user = await prisma.user.findUnique({ where: { email } });

      if (user) {
        const rawToken = generateRandomToken(32);
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

        await prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
          },
        });

        await logAuditAction(req, 'PASSWORD_RESET_REQUESTED', 'User', user.id);

        // Note: In development or when email provider is not yet configured,
        // we provide the instruction or log it securely without breaking
        if (env.NODE_ENV === 'development') {
          console.info(`[DEV ONLY - RESET TOKEN] For ${email}: ${rawToken}`);
        }
      }

      // Consistent message to prevent email enumeration
      res.json({
        success: true,
        message: 'Si cette adresse email est enregistrée, les instructions de réinitialisation ont été préparées.',
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/auth/reset-password
  async resetPassword(req, res, next) {
    try {
      const { token, newPassword } = req.body;

      const tokenHash = hashToken(token);
      const resetRecord = await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!resetRecord || resetRecord.usedAt || new Date(resetRecord.expiresAt) < new Date()) {
        return next(new AppError('Ce lien de réinitialisation est invalide ou a expiré.', 400, 'INVALID_RESET_TOKEN'));
      }

      const strengthCheck = validatePasswordStrength(newPassword);
      if (!strengthCheck.valid) {
        return next(new AppError(strengthCheck.message, 400, 'WEAK_PASSWORD'));
      }

      const newPasswordHash = await hashPassword(newPassword);

      // Update password & mark token as used in a transaction
      await prisma.$transaction([
        prisma.user.update({
          where: { id: resetRecord.userId },
          data: {
            passwordHash: newPasswordHash,
            mustChangePassword: false,
          },
        }),
        prisma.passwordResetToken.update({
          where: { id: resetRecord.id },
          data: { usedAt: new Date() },
        }),
        prisma.refreshSession.updateMany({
          where: { userId: resetRecord.userId, isRevoked: false },
          data: { isRevoked: true },
        }),
      ]);

      await logAuditAction(req, 'PASSWORD_RESET_COMPLETED', 'User', resetRecord.userId);

      res.json({
        success: true,
        message: 'Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.',
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/auth/me
  async getMe(req, res) {
    res.json({
      success: true,
      data: {
        user: req.user,
      },
    });
  },
};
