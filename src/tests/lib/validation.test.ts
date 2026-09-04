import { describe, it, expect } from 'vitest';
import { organizationSchema, userSchema } from '@omnikes/lib/validation';

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
});
