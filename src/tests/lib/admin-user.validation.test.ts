import { describe, expect, it } from 'vitest';
import { adminUserCreateSchema, adminUserUpdateSchema } from '@omnikes/lib/validation';

describe('Administration user validation', () => {
  const roleId = 'cl1234567890ab';

  it('accepts a valid user creation payload', () => {
    expect(adminUserCreateSchema.safeParse({
      name: 'Jean Test',
      email: 'jean@example.com',
      password: 'SecurePass123!',
      roleId,
    }).success).toBe(true);
  });

  it('accepts a seeded role identifier that is not a CUID', () => {
    expect(adminUserCreateSchema.safeParse({
      name: 'Jean Test',
      email: 'jean@example.com',
      password: 'SecurePass123!',
      roleId: 'admin-role-a',
    }).success).toBe(true);
  });

  it('rejects an empty role identifier', () => {
    expect(adminUserCreateSchema.safeParse({
      name: 'Jean Test',
      email: 'jean@example.com',
      password: 'SecurePass123!',
      roleId: '',
    }).success).toBe(false);
  });

  it('requires a strong enough initial password length', () => {
    expect(adminUserCreateSchema.safeParse({
      name: 'Jean Test',
      email: 'jean@example.com',
      password: 'short',
      roleId,
    }).success).toBe(false);
  });

  it('allows partial account updates without exposing organizationId', () => {
    const result = adminUserUpdateSchema.safeParse({
      name: 'Jean Modifié',
      isActive: false,
      roleId,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('organizationId' in result.data).toBe(false);
    }
  });
});
