import { prisma } from '../config/db.js';

export const dashboardController = {
  // GET /api/v1/admin/dashboard/stats
  async getStats(req, res, next) {
    try {
      const { period = '30d' } = req.query;

      const now = new Date();
      let startDate = new Date();

      if (period === 'today') {
        startDate.setHours(0, 0, 0, 0);
      } else if (period === '7d') {
        startDate.setDate(now.getDate() - 7);
      } else if (period === '30d') {
        startDate.setDate(now.getDate() - 30);
      } else if (period === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else {
        startDate = new Date(0); // All time
      }

      // Parallel queries for real metrics
      const [
        totalOrders,
        pendingOrders,
        deliveredOrders,
        cancelledOrders,
        revenueData,
        lowStockVariants,
        outOfStockVariants,
        totalProducts,
        newCustomers,
        recentOrders,
        topSellingItems,
      ] = await Promise.all([
        // Total orders in period
        prisma.order.count({
          where: { createdAt: { gte: startDate } },
        }),
        // Pending
        prisma.order.count({
          where: { orderStatus: 'PENDING', createdAt: { gte: startDate } },
        }),
        // Delivered
        prisma.order.count({
          where: { orderStatus: 'DELIVERED', createdAt: { gte: startDate } },
        }),
        // Cancelled
        prisma.order.count({
          where: { orderStatus: 'CANCELLED', createdAt: { gte: startDate } },
        }),
        // Revenue (only from non-cancelled orders)
        prisma.order.aggregate({
          where: {
            orderStatus: { notIn: ['CANCELLED', 'RETURNED'] },
            createdAt: { gte: startDate },
          },
          _sum: { totalAmount: true },
          _avg: { totalAmount: true },
        }),
        // Low stock variants (stockQuantity <= alertThreshold and > 0)
        prisma.productVariant.count({
          where: {
            stockQuantity: { gt: 0, lte: 5 },
          },
        }),
        // Out of stock variants (stockQuantity = 0)
        prisma.productVariant.count({
          where: {
            stockQuantity: { lte: 0 },
          },
        }),
        // Active published products
        prisma.product.count({
          where: { status: 'PUBLISHED' },
        }),
        // New customer accounts
        prisma.user.count({
          where: { role: 'CUSTOMER', createdAt: { gte: startDate } },
        }),
        // Recent 5 orders
        prisma.order.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            orderNumber: true,
            customerFirstName: true,
            customerLastName: true,
            totalAmount: true,
            orderStatus: true,
            paymentStatus: true,
            paymentMethod: true,
            createdAt: true,
          },
        }),
        // Top selling products based on order items
        prisma.orderItem.groupBy({
          by: ['productName'],
          _sum: { quantity: true, totalPrice: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 5,
        }),
      ]);

      const totalRevenue = revenueData._sum.totalAmount ? Number(revenueData._sum.totalAmount) : 0;
      const averageOrderValue = revenueData._avg.totalAmount ? Math.round(Number(revenueData._avg.totalAmount)) : 0;

      res.json({
        success: true,
        data: {
          period,
          metrics: {
            totalRevenue,
            averageOrderValue,
            totalOrders,
            pendingOrders,
            deliveredOrders,
            cancelledOrders,
            totalProducts,
            lowStockVariants,
            outOfStockVariants,
            newCustomers,
            currency: 'MAD',
          },
          recentOrders: recentOrders.map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            customer: `${o.customerFirstName} ${o.customerLastName}`,
            total: Number(o.totalAmount),
            status: o.orderStatus,
            paymentStatus: o.paymentStatus,
            paymentMethod: o.paymentMethod,
            date: o.createdAt,
          })),
          topSelling: topSellingItems.map((item) => ({
            name: item.productName,
            soldQuantity: item._sum.quantity || 0,
            revenue: Number(item._sum.totalPrice || 0),
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
