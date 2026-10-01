import { describe, expect, it } from 'vitest';
import { adminRoleCreateSchema, adminRoleUpdateSchema } from '@omnikes/lib/validation';

describe('Administration role validation', () => {
  const permissionId = 'cl1234567890ab';
  const storeId = 'clstore123456789';

  it('accepts a global role', () => {
    expect(adminRoleCreateSchema.safeParse({
      name: 'MANAGER',
      description: 'Manager',
      isGlobal: true,
      permissionIds: [permissionId],
    }).success).toBe(true);
  });

  it('requires a store for a scoped role', () => {
    expect(adminRoleCreateSchema.safeParse({
      name: 'CAISSIER STORE A',
      isGlobal: false,
      permissionIds: [],
    }).success).toBe(false);
  });

  it('rejects a global role with a store', () => {
    expect(adminRoleCreateSchema.safeParse({
      name: 'MANAGER',
      isGlobal: true,
      storeId,
      permissionIds: [],
    }).success).toBe(false);
  });

  it('accepts a scoped role with a store', () => {
    expect(adminRoleCreateSchema.safeParse({
      name: 'CAISSIER STORE A',
      isGlobal: false,
      storeId,
      permissionIds: [permissionId],
    }).success).toBe(true);
  });

  it('allows partial updates without organizationId', () => {
    const result = adminRoleUpdateSchema.safeParse({
      description: 'Description modifiée',
      permissionIds: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('organizationId' in result.data).toBe(false);
    }
  });

  it('rejects invalid permission identifiers', () => {
    expect(adminRoleCreateSchema.safeParse({
      name: 'MANAGER',
      isGlobal: true,
      permissionIds: ['invalid'],
    }).success).toBe(false);
  });
});
