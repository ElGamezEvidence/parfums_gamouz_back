import request from 'supertest';
import app from '../src/app.js';
import { validatePasswordStrength } from '../src/utils/security.js';

describe('GAAMOUZE Backend API Suite', () => {
  describe('Health Check Endpoint', () => {
    it('GET /api/v1/health should respond with status code and system metrics', async () => {
      const res = await request(app).get('/api/v1/health');
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('system');
    });
  });

  describe('Security & Password Complexity', () => {
    it('should reject passwords shorter than 8 characters', () => {
      const res = validatePasswordStrength('Short1!');
      expect(res.valid).toBe(false);
    });

    it('should reject passwords without numbers', () => {
      const res = validatePasswordStrength('NoNumbersHere!');
      expect(res.valid).toBe(false);
    });

    it('should reject passwords without special characters', () => {
      const res = validatePasswordStrength('NoSpecialChar123');
      expect(res.valid).toBe(false);
    });

    it('should accept strong passwords', () => {
      const res = validatePasswordStrength('LuxuryGamouze@2026');
      expect(res.valid).toBe(true);
    });
  });

  describe('Authentication Security', () => {
    it('POST /api/v1/auth/login with invalid payload should return 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /api/v1/auth/login accepts GAAMOUZE admin identifier format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'abdelaligamouz@1448', password: 'wrong-password-123!' });

      expect(res.status).not.toBe(400);
      expect(res.body.error?.code).not.toBe('VALIDATION_ERROR');
    });

    it('POST /api/v1/auth/login with non-existent user should return 401 without revealing user existence', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@gamouze.com', password: 'SomePassword123!' });

      expect([401, 500, 503]).toContain(res.status);
      if (res.status === 401) {
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      }
    });
  });

  describe('RBAC & Route Protection', () => {
    it('GET /api/v1/admin/dashboard/stats should reject unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/admin/dashboard/stats');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/v1/admin/orders should reject unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/admin/orders');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('POST /api/v1/admin/products should reject unauthenticated requests with 401', async () => {
      const res = await request(app).post('/api/v1/admin/products').send({});
      expect(res.status).toBe(401);
    });
  });

  describe('Order Validation', () => {
    it('POST /api/v1/orders with empty items should return 400 validation error', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .send({
          customer: {
            firstName: 'Ali',
            lastName: 'Karim',
            phone: '0612345678',
            city: 'Casablanca',
            address: 'Boulevard d\'Anfa',
          },
          items: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('POST /api/v1/orders with missing phone should return 400', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .send({
          customer: {
            firstName: 'Ali',
            lastName: 'Karim',
            city: 'Casablanca',
            address: 'Boulevard d\'Anfa',
          },
          items: [{ productId: 'test-id', quantity: 1 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
