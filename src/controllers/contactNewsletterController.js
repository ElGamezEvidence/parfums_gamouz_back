import { z } from 'zod';
import { prisma } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditAction } from '../middleware/audit.js';

export const contactSchema = z.object({
  name: z.string().min(2, 'Le nom est requis.').trim(),
  email: z.string().email('Adresse email invalide.').trim().toLowerCase(),
  phone: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(10, 'Le message doit comporter au moins 10 caractères.').trim(),
});

export const newsletterSchema = z.object({
  email: z.string().email('Adresse email invalide.').trim().toLowerCase(),
});

export const contactNewsletterController = {
  // POST /api/v1/contact
  async submitContact(req, res, next) {
    try {
      const data = req.body;

      const record = await prisma.contactMessage.create({
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          subject: data.subject || null,
          message: data.message,
          status: 'NEW',
        },
      });

      res.status(201).json({
        success: true,
        message: 'Votre message a bien été transmis à la Maison GAMOUZE. Notre équipe vous répondra dans les plus brefs délais.',
        data: { id: record.id },
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/newsletter/subscribe
  async subscribeNewsletter(req, res, next) {
    try {
      const { email } = req.body;

      const existing = await prisma.newsletterSubscriber.findUnique({
        where: { email },
      });

      if (existing) {
        if (!existing.isActive) {
          await prisma.newsletterSubscriber.update({
            where: { email },
            data: { isActive: true },
          });
        }
        return res.json({
          success: true,
          message: 'Votre inscription à notre cercle privé a été confirmée.',
        });
      }

      await prisma.newsletterSubscriber.create({
        data: { email, isActive: true },
      });

      res.status(201).json({
        success: true,
        message: 'Bienvenue au sein du cercle privilégié GAMOUZE.',
      });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: GET /api/v1/admin/messages
  async adminGetMessages(req, res, next) {
    try {
      const messages = await prisma.contactMessage.findMany({
        orderBy: { createdAt: 'desc' },
      });
      res.json({ success: true, data: messages });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: GET /api/v1/admin/newsletter/subscribers
  async adminGetSubscribers(req, res, next) {
    try {
      const subscribers = await prisma.newsletterSubscriber.findMany({
        orderBy: { subscribedAt: 'desc' },
      });
      res.json({ success: true, data: subscribers });
    } catch (err) {
      next(err);
    }
  },
};
