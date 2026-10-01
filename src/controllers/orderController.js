import { z } from 'zod';
import { prisma } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { logAuditAction } from '../middleware/audit.js';

// Schema for customer / guest order creation
export const createOrderSchema = z.object({
  idempotencyKey: z.string().optional(),
  customer: z.object({
    firstName: z.string().min(2, 'Le prénom est requis.').trim(),
    lastName: z.string().min(2, 'Le nom est requis.').trim(),
    phone: z.string().min(8, 'Le numéro de téléphone est requis.').trim(),
    email: z.string().email('Adresse email invalide.').optional().or(z.literal('')),
    city: z.string().min(2, 'La ville est requise.').trim(),
    region: z.string().optional(),
    address: z.string().min(5, 'L\'adresse de livraison est requise.').trim(),
    notes: z.string().optional(),
  }),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        variantId: z.string().optional(),
        volume: z.string().optional(),
        quantity: z.coerce.number().int().min(1, 'La quantité minimale est de 1.'),
      })
    )
    .min(1, 'Le panier ne peut pas être vide.'),
  couponCode: z.string().optional(),
  paymentMethod: z.enum(['COD', 'ONLINE']).default('COD'),
});

// Schema for admin status transition
export const updateOrderStatusSchema = z.object({
  status: z.enum([
    'PENDING',
    'CONFIRMED',
    'PROCESSING',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'RETURN_REQUESTED',
    'RETURNED',
  ]),
  comment: z.string().optional(),
  paymentStatus: z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED']).optional(),
  internalNotes: z.string().optional(),
});

export const orderController = {
  // POST /api/v1/orders (Create order with strict server-side calculation and stock deduction)
  async createOrder(req, res, next) {
    try {
      const { idempotencyKey, customer, items, couponCode, paymentMethod } = req.body;

      // Idempotency check: prevent duplicate submissions
      if (idempotencyKey) {
        const existingOrder = await prisma.order.findUnique({
          where: { idempotencyKey },
          include: { items: true },
        });
        if (existingOrder) {
          return res.status(200).json({
            success: true,
            message: 'Commande déjà enregistrée (idempotence).',
            data: {
              orderId: existingOrder.id,
              orderNumber: existingOrder.orderNumber,
              total: Number(existingOrder.totalAmount),
              status: existingOrder.orderStatus,
            },
          });
        }
      }

      // Fetch site settings for shipping rules (Default: 500 MAD threshold, 40 MAD fee)
      const settings = await prisma.siteSetting.findMany({
        where: { key: { in: ['shipping_free_threshold', 'shipping_standard_fee'] } },
      });
      const thresholdSetting = settings.find((s) => s.key === 'shipping_free_threshold');
      const feeSetting = settings.find((s) => s.key === 'shipping_standard_fee');

      const freeThreshold = thresholdSetting ? Number(thresholdSetting.value) : 500;
      const standardShippingFee = feeSetting ? Number(feeSetting.value) : 40;

      // Transactional validation & creation
      const result = await prisma.$transaction(async (tx) => {
        let calculatedSubtotal = 0;
        const verifiedOrderItems = [];

        // Verify products and variants directly in PostgreSQL
        for (const cartItem of items) {
          const product = await tx.product.findUnique({
            where: { id: cartItem.productId },
            include: {
              variants: true,
              translations: { where: { locale: 'fr' } },
            },
          });

          if (!product || product.status !== 'PUBLISHED') {
            throw new AppError(`Le produit demandé n'est plus disponible au catalogue.`, 400);
          }

          // Find variant by variantId or volume
          let variant = null;
          if (cartItem.variantId) {
            variant = product.variants.find((v) => v.id === cartItem.variantId);
          } else if (cartItem.volume) {
            variant = product.variants.find((v) => v.volume === cartItem.volume);
          } else {
            variant = product.variants.find((v) => v.isDefault) || product.variants[0];
          }

          if (!variant) {
            throw new AppError(`La déclinaison sélectionnée pour "${product.sku}" n'existe pas.`, 400);
          }

          // Stock verification
          if (variant.stockQuantity < cartItem.quantity) {
            throw new AppError(
              `Stock insuffisant pour "${product.translations[0]?.name || product.sku} (${variant.volume})". ` +
                `Disponible : ${variant.stockQuantity}.`,
              400,
              'OUT_OF_STOCK'
            );
          }

          // Use real database unit price (salePrice if active, else variant price)
          const unitPrice = variant.salePrice ? Number(variant.salePrice) : Number(variant.price);
          const itemSubtotal = unitPrice * cartItem.quantity;
          calculatedSubtotal += itemSubtotal;

          // Decrement stock
          await tx.productVariant.update({
            where: { id: variant.id },
            data: { stockQuantity: variant.stockQuantity - cartItem.quantity },
          });

          // Log inventory movement
          await tx.inventoryMovement.create({
            data: {
              productId: product.id,
              variantId: variant.id,
              type: 'SALE',
              quantity: -cartItem.quantity,
              beforeQty: variant.stockQuantity,
              afterQty: variant.stockQuantity - cartItem.quantity,
              reason: `Vente client - Commande en cours`,
              userId: req.user ? req.user.id : null,
            },
          });

          verifiedOrderItems.push({
            productId: product.id,
            variantId: variant.id,
            productName: product.translations[0]?.name || product.sku,
            variantVolume: variant.volume,
            unitPrice,
            quantity: cartItem.quantity,
            totalPrice: itemSubtotal,
          });
        }

        // Apply Coupon if supplied
        let discountAmount = 0;
        let appliedCoupon = null;
        if (couponCode && couponCode.trim()) {
          const coupon = await tx.coupon.findUnique({
            where: { code: couponCode.trim().toUpperCase() },
          });

          if (
            coupon &&
            coupon.isActive &&
            (!coupon.expiresAt || new Date(coupon.expiresAt) > new Date()) &&
            (!coupon.maxUsage || coupon.usedCount < coupon.maxUsage) &&
            (!coupon.minOrderAmount || calculatedSubtotal >= Number(coupon.minOrderAmount))
          ) {
            appliedCoupon = coupon;
            if (coupon.discountType === 'PERCENTAGE') {
              discountAmount = (calculatedSubtotal * Number(coupon.discountValue)) / 100;
            } else {
              discountAmount = Number(coupon.discountValue);
            }
            if (discountAmount > calculatedSubtotal) {
              discountAmount = calculatedSubtotal;
            }

            // Increment coupon usage
            await tx.coupon.update({
              where: { id: coupon.id },
              data: { usedCount: { increment: 1 } },
            });
          }
        }

        // Calculate shipping fee
        const eligibleSubtotal = Math.max(0, calculatedSubtotal - discountAmount);
        const shippingFee = eligibleSubtotal >= freeThreshold ? 0 : standardShippingFee;
        const totalAmount = eligibleSubtotal + shippingFee;

        // Generate unique order number (format: GZ-2026-XXXXX)
        const randomDigits = Math.floor(10000 + Math.random() * 90000);
        const orderNumber = `GZ-2026-${randomDigits}`;

        // Create Order in DB
        const createdOrder = await tx.order.create({
          data: {
            orderNumber,
            idempotencyKey: idempotencyKey || null,
            customerId: req.user ? req.user.id : null,
            customerFirstName: customer.firstName,
            customerLastName: customer.lastName,
            customerPhone: customer.phone,
            customerEmail: customer.email || null,
            shippingCity: customer.city,
            shippingRegion: customer.region || null,
            shippingAddress: customer.address,
            shippingNotes: customer.notes || null,
            subtotal: calculatedSubtotal,
            shippingFee,
            discountAmount,
            totalAmount,
            currency: 'MAD',
            couponCode: appliedCoupon ? appliedCoupon.code : null,
            paymentMethod,
            paymentStatus: 'PENDING', // COD or Online: always initially PENDING until confirmed/paid
            orderStatus: 'PENDING',
            items: {
              create: verifiedOrderItems,
            },
            events: {
              create: {
                statusTo: 'PENDING',
                comment: 'Création de la commande par le client.',
                userId: req.user ? req.user.id : null,
              },
            },
            payments: {
              create: {
                amount: totalAmount,
                currency: 'MAD',
                method: paymentMethod,
                status: 'PENDING',
              },
            },
          },
          include: {
            items: true,
          },
        });

        // Record coupon redemption if coupon applied
        if (appliedCoupon) {
          await tx.couponRedemption.create({
            data: {
              couponId: appliedCoupon.id,
              orderId: createdOrder.id,
              customerEmail: customer.email || null,
            },
          });
        }

        return createdOrder;
      });

      res.status(201).json({
        success: true,
        message: 'Commande validée avec succès.',
        data: {
          orderId: result.id,
          orderNumber: result.orderNumber,
          customer: {
            firstName: result.customerFirstName,
            lastName: result.customerLastName,
            phone: result.customerPhone,
            city: result.shippingCity,
          },
          subtotal: Number(result.subtotal),
          shipping: Number(result.shippingFee),
          discount: Number(result.discountAmount),
          total: Number(result.totalAmount),
          currency: result.currency,
          paymentMethod: result.paymentMethod,
          status: result.orderStatus,
          createdAt: result.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/orders/:orderNumber (Customer lookup by order number and phone for guest, or logged in user)
  async getOrderByNumber(req, res, next) {
    try {
      const { orderNumber } = req.params;
      const { phone } = req.query;

      const order = await prisma.order.findUnique({
        where: { orderNumber },
        include: {
          items: true,
          events: { orderBy: { createdAt: 'asc' } },
        },
      });

      if (!order) {
        return next(new AppError('Commande introuvable.', 404, 'ORDER_NOT_FOUND'));
      }

      // Security: if user is not an admin, verify ownership or phone match
      const isAdmin = req.user && ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'SUPPORT'].includes(req.user.role);
      const isOwner = req.user && req.user.id === order.customerId;
      const matchesPhone = phone && order.customerPhone.includes(phone.trim());

      if (!isAdmin && !isOwner && !matchesPhone) {
        return next(
          new AppError('Accès non autorisé aux détails de cette commande.', 403, 'UNAUTHORIZED_ORDER_ACCESS')
        );
      }

      res.json({
        success: true,
        data: {
          id: order.id,
          orderNumber: order.orderNumber,
          customerFirstName: order.customerFirstName,
          customerLastName: order.customerLastName,
          customerPhone: order.customerPhone,
          shippingAddress: order.shippingAddress,
          shippingCity: order.shippingCity,
          subtotal: Number(order.subtotal),
          shippingFee: Number(order.shippingFee),
          discountAmount: Number(order.discountAmount),
          totalAmount: Number(order.totalAmount),
          currency: order.currency,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          orderStatus: order.orderStatus,
          items: order.items.map((i) => ({
            id: i.id,
            productName: i.productName,
            variantVolume: i.variantVolume,
            unitPrice: Number(i.unitPrice),
            quantity: i.quantity,
            totalPrice: Number(i.totalPrice),
          })),
          events: order.events.map((e) => ({
            statusTo: e.statusTo,
            comment: e.comment,
            createdAt: e.createdAt,
          })),
          createdAt: order.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ADMIN: GET /api/v1/admin/orders
  async adminGetOrders(req, res, next) {
    try {
      const { q, status, paymentStatus, page = 1, limit = 20 } = req.query;

      const where = {};
      if (status && status !== 'ALL') where.orderStatus = status;
      if (paymentStatus && paymentStatus !== 'ALL') where.paymentStatus = paymentStatus;
      if (q && q.trim()) {
        const queryTerm = q.trim();
        where.OR = [
          { orderNumber: { contains: queryTerm, mode: 'insensitive' } },
          { customerPhone: { contains: queryTerm } },
          { customerLastName: { contains: queryTerm, mode: 'insensitive' } },
          { customerEmail: { contains: queryTerm, mode: 'insensitive' } },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [total, orders] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: 'desc' },
          include: {
            items: true,
          },
        }),
      ]);

      const items = orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: `${o.customerFirstName} ${o.customerLastName}`,
        customerPhone: o.customerPhone,
        shippingCity: o.shippingCity,
        totalAmount: Number(o.totalAmount),
        currency: o.currency,
        itemsCount: o.items.reduce((s, i) => s + i.quantity, 0),
        orderStatus: o.orderStatus,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt,
      }));

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

  // ADMIN: PUT /api/v1/admin/orders/:id/status
  async adminUpdateOrderStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, comment, paymentStatus, internalNotes } = req.body;

      const existingOrder = await prisma.order.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!existingOrder) {
        return next(new AppError('Commande introuvable.', 404));
      }

      // If cancelling, restore stock
      const isCancelling = status === 'CANCELLED' && existingOrder.orderStatus !== 'CANCELLED';

      await prisma.$transaction(async (tx) => {
        if (isCancelling) {
          for (const item of existingOrder.items) {
            if (item.variantId) {
              const variant = await tx.productVariant.findUnique({ where: { id: item.variantId } });
              if (variant) {
                await tx.productVariant.update({
                  where: { id: item.variantId },
                  data: { stockQuantity: variant.stockQuantity + item.quantity },
                });
                await tx.inventoryMovement.create({
                  data: {
                    productId: variant.productId,
                    variantId: variant.id,
                    type: 'RETURN',
                    quantity: item.quantity,
                    beforeQty: variant.stockQuantity,
                    afterQty: variant.stockQuantity + item.quantity,
                    reason: `Annulation de la commande ${existingOrder.orderNumber}`,
                    userId: req.user.id,
                  },
                });
              }
            }
          }
        }

        const updateData = {
          orderStatus: status,
          ...(paymentStatus ? { paymentStatus } : {}),
          ...(internalNotes ? { internalNotes } : {}),
        };

        await tx.order.update({
          where: { id },
          data: updateData,
        });

        await tx.orderEvent.create({
          data: {
            orderId: id,
            statusFrom: existingOrder.orderStatus,
            statusTo: status,
            comment: comment || `Statut mis à jour par ${req.user.email}`,
            userId: req.user.id,
          },
        });
      });

      await logAuditAction(req, 'UPDATE_ORDER_STATUS', 'Order', id, {
        from: existingOrder.orderStatus,
        to: status,
        paymentStatus,
      });

      res.json({
        success: true,
        message: 'Statut de commande mis à jour avec succès.',
      });
    } catch (err) {
      next(err);
    }
  },
};
