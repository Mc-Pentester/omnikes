import { describe, it, expect } from 'vitest';
import { organizationSchema, userSchema, saleSchema } from '@omnikes/lib/validation';

describe('Validation Schemas', () => {
  describe('organizationSchema', () => {
    it('should validate a valid organization', () => {
      const result = organizationSchema.safeParse({
        name: 'Test Organization',
        slug: 'test-org',
        country: 'US',
        currency: 'USD',
        locale: 'en-US',
        timezone: 'UTC',
        cloudEnabled: false,
        onlineStoreEnabled: false,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid slug format', () => {
      const result = organizationSchema.safeParse({
        name: 'Test Organization',
        slug: 'Test_Org_Invalid',
        country: 'US',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing name', () => {
      const result = organizationSchema.safeParse({
        slug: 'test-org',
        country: 'US',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('userSchema', () => {
    it('should validate a valid user', () => {
      const result = userSchema.safeParse({
        organizationId: 'cl1234567890ab',
        email: 'test@example.com',
        name: 'Test User',
        password: 'securepassword123',
        isActive: true,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = userSchema.safeParse({
        organizationId: 'cl1234567890ab',
        email: 'invalid-email',
        name: 'Test User',
        password: 'securepassword123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject short password', () => {
      const result = userSchema.safeParse({
        organizationId: 'cl1234567890ab',
        email: 'test@example.com',
        name: 'Test User',
        password: 'short',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('saleSchema', () => {
    it('should validate a valid sale with applyTax', () => {
      const result = saleSchema.safeParse({
        organizationId: 'cl1234567890ab',
        storeId: 'cl1234567890ac',
        orderNumber: 'SALE-001',
        customerId: 'cl1234567890ad',
        channel: 'POS',
        status: 'PENDING',
        subtotal: 100,
        tax: 10,
        total: 110,
        discount: 0,
        applyTax: true,
      });
      expect(result.success).toBe(true);
    });

    it('should validate a valid sale with applyTax false', () => {
      const result = saleSchema.safeParse({
        organizationId: 'cl1234567890ab',
        storeId: 'cl1234567890ac',
        orderNumber: 'SALE-001',
        channel: 'POS',
        status: 'PENDING',
        subtotal: 100,
        tax: 0,
        total: 100,
        discount: 0,
        applyTax: false,
      });
      expect(result.success).toBe(true);
    });

    it('should default applyTax to true', () => {
      const result = saleSchema.safeParse({
        organizationId: 'cl1234567890ab',
        storeId: 'cl1234567890ac',
        orderNumber: 'SALE-001',
        channel: 'POS',
        status: 'PENDING',
        subtotal: 100,
        tax: 10,
        total: 110,
        discount: 0,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.applyTax).toBe(true);
      }
    });
  });
});
