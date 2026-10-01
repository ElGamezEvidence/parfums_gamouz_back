import { prisma } from '../config/db.js';

export const logAuditAction = async (req, action, entity, entityId, details = null) => {
  try {
    const userId = req.user ? req.user.id : null;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;
    const userAgent = req.headers['user-agent'] || null;

    // Filter out passwords and sensitive fields from details
    let safeDetails = null;
    if (details) {
      const copy = { ...details };
      delete copy.password;
      delete copy.newPassword;
      delete copy.currentPassword;
      delete copy.token;
      safeDetails = JSON.stringify(copy);
    }

    await prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId: entityId ? String(entityId) : null,
        userId,
        detailsJson: safeDetails,
        ipAddress: typeof ipAddress === 'string' ? ipAddress : null,
        userAgent,
      },
    });
  } catch (err) {
    // Non-blocking error: do not crash the request if audit logging fails
    console.error('[AUDIT LOG ERROR]', err.message);
  }
};
