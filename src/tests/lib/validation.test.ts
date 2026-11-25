import { describe, it, expect } from 'vitest';
import { organizationSchema, userSchema, saleSchema, paymentSchema, saleCreditSchema, proformaSchema, proformaItemSchema } from '@omnikes/lib/validation';

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

  describe('paymentSchema', () => {
    it('should reject CREDIT as a new payment method', () => {
      const result = paymentSchema.safeParse({
        saleId: 'cl1234567890ad',
        method: 'CREDIT',
        amount: 100,
      });
      expect(result.success).toBe(false);
    });

    it('should accept a real payment method', () => {
      const result = paymentSchema.safeParse({
        saleId: 'cl1234567890ad',
        method: 'CASH',
        amount: 100,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('saleCreditSchema', () => {
    it('should validate explicit customer credit', () => {
      const result = saleCreditSchema.safeParse({
        customerId: 'cl1234567890ad',
        amount: 100,
        note: 'Approved by cashier',
      });
      expect(result.success).toBe(true);
    });

    it('should reject zero or negative credit', () => {
      expect(saleCreditSchema.safeParse({
        customerId: 'cl1234567890ad',
        amount: 0,
      }).success).toBe(false);

      expect(saleCreditSchema.safeParse({
        customerId: 'cl1234567890ad',
        amount: -10,
      }).success).toBe(false);
    });
  });

});


describe('P0-28-B proforma monetary precision', () => {
  it('rejects proforma financial values with more than two decimals', () => {
    const base = {
      organizationId: 'cmu8gsgwp0000fgqr0uckya14',
      storeId: 'cmubhviiu000i0sqr92jnxdrs',
      subtotal: 10.01,
      tax: 1.8,
      total: 11.81,
      discount: 0,
    };

    expect(() => proformaSchema.parse(base)).not.toThrow();
    expect(() => proformaSchema.parse({ ...base, subtotal: 10.001 })).toThrow();
    expect(() => proformaSchema.parse({ ...base, tax: Number.POSITIVE_INFINITY })).toThrow();
  });

  it('rejects proforma item financial values with more than two decimals', () => {
    const base = {
      proformaId: 'cmu8gsgwp0000fgqr0uckya14',
      variantId: 'cmubhviiu000i0sqr92jnxdrs',
      quantity: 1,
      unitPrice: 10.01,
      totalPrice: 10.01,
      discount: 0,
    };

    expect(() => proformaItemSchema.parse(base)).not.toThrow();
    expect(() => proformaItemSchema.parse({ ...base, unitPrice: 10.001 })).toThrow();
    expect(() => proformaItemSchema.parse({ ...base, totalPrice: Number.POSITIVE_INFINITY })).toThrow();
  });
});
