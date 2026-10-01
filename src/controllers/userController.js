import { z } from 'zod';
import { prisma } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { hashPassword, validatePasswordStrength } from '../utils/security.js';
import { logAuditAction } from '../middleware/audit.js';

export const userCreateSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(8),
  firstName: z.string().min(2).trim(),
  lastName: z.string().min(2).trim(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EDITOR', 'SUPPORT']),
});

export const userController = {
  // ADMIN: GET /api/v1/admin/users
  async adminGetUsers(req, res, next) {
    try {
      const users = await prisma.user.findMany({
        where: { role: { not: 'CUSTOMER' } },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          lastLoginAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ success: true, data: users });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: POST /api/v1/admin/users (SUPER_ADMIN only)
  async adminCreateUser(req, res, next) {
    try {
      const data = req.body;

      const strengthCheck = validatePasswordStrength(data.password);
      if (!strengthCheck.valid) {
        return next(new AppError(strengthCheck.message, 400));
      }

      const existing = await prisma.user.findUnique({ where: { email: data.email } });
      if (existing) {
        return next(new AppError('Un compte avec cette adresse existe déjà.', 409));
      }

      const passwordHash = await hashPassword(data.password);

      const user = await prisma.user.create({
        data: {
          email: data.email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role,
          mustChangePassword: true, // Forces new staff to set their own password on first login
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
        },
      });

      await logAuditAction(req, 'CREATE_STAFF_USER', 'User', user.id, { email: user.email, role: user.role });

      res.status(201).json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: GET /api/v1/admin/customers
  async adminGetCustomers(req, res, next) {
    try {
      const { q, page = 1, limit = 20 } = req.query;

      const where = { role: 'CUSTOMER' };
      if (q && q.trim()) {
        const queryTerm = q.trim();
        where.OR = [
          { email: { contains: queryTerm, mode: 'insensitive' } },
          { firstName: { contains: queryTerm, mode: 'insensitive' } },
          { lastName: { contains: queryTerm, mode: 'insensitive' } },
          { phone: { contains: queryTerm } },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [total, customers] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            isActive: true,
            createdAt: true,
            orders: {
              select: {
                totalAmount: true,
                orderStatus: true,
              },
            },
          },
        }),
      ]);

      const items = customers.map((c) => {
        const totalSpent = c.orders
          .filter((o) => o.orderStatus !== 'CANCELLED')
          .reduce((sum, o) => sum + Number(o.totalAmount), 0);

        return {
          id: c.id,
          name: `${c.firstName} ${c.lastName}`.trim(),
          email: c.email,
          phone: c.phone || '—',
          ordersCount: c.orders.length,
          totalSpent,
          isActive: c.isActive,
          createdAt: c.createdAt,
        };
      });

      res.json({
        success: true,
        data: {
          items,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: GET /api/v1/admin/audit-logs
  async adminGetAuditLogs(req, res, next) {
    try {
      const { page = 1, limit = 50 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const [total, logs] = await Promise.all([
        prisma.auditLog.count(),
        prisma.auditLog.findMany({
          skip,
          take: Number(limit),
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { email: true, role: true } },
          },
        }),
      ]);

      res.json({
        success: true,
        data: {
          items: logs.map((l) => ({
            id: l.id,
            action: l.action,
            entity: l.entity,
            entityId: l.entityId,
            userEmail: l.user ? l.user.email : 'Système / Invité',
            userRole: l.user ? l.user.role : 'GUEST',
            details: l.detailsJson ? JSON.parse(l.detailsJson) : null,
            ipAddress: l.ipAddress,
            createdAt: l.createdAt,
          })),
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
