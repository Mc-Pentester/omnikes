import { describe, expect, it } from 'vitest';
import { CASHIER_ROLE, STANDARD_TENANT_ROLES, TENANT_PERMISSION_CODES } from '@omnikes/lib/rbac/standard-tenant-roles';
import catalog from '@omnikes/lib/rbac/standard-tenant-rbac.json';

describe('standard tenant RBAC roles', () => {
  it('uses one canonical permission catalogue for tenant roles', () => {
    expect(TENANT_PERMISSION_CODES).toEqual(catalog.tenantPermissions);
    expect(new Set(TENANT_PERMISSION_CODES).size).toBe(TENANT_PERMISSION_CODES.length);
    for (const role of [CASHIER_ROLE, ...STANDARD_TENANT_ROLES]) {
      for (const permission of role.permissions) expect(TENANT_PERMISSION_CODES).toContain(permission);
    }
    expect(CASHIER_ROLE.permissions).not.toContain('sale.update');
    expect(TENANT_PERMISSION_CODES).not.toContain('organization.subscription.manage');
    expect(catalog.platformPermissions.map((permission) => permission.code)).toEqual(['organization.subscription.manage']);
  });

  it('defines the expected operational roles without exposing platform roles', () => {
    expect(STANDARD_TENANT_ROLES.map((role) => role.name)).toEqual([
      'MANAGER',
      'STORE_MANAGER',
      'SELLER',
      'INVENTORY_MANAGER',
      'PURCHASING_MANAGER',
      'ACCOUNTANT',
      'AUDITOR',
    ]);
    expect(STANDARD_TENANT_ROLES.some((role) => /PLATFORM|SUPER_ADMIN/i.test(role.name))).toBe(false);
  });

  it('keeps operational and read-only roles least-privileged', () => {
    const manager = STANDARD_TENANT_ROLES.find((role) => role.name === 'MANAGER')!;
    const seller = STANDARD_TENANT_ROLES.find((role) => role.name === 'SELLER')!;
    const accountant = STANDARD_TENANT_ROLES.find((role) => role.name === 'ACCOUNTANT')!;
    const auditor = STANDARD_TENANT_ROLES.find((role) => role.name === 'AUDITOR')!;

    expect(manager.permissions).not.toContain('backup.restore');
    expect(seller.permissions).not.toContain('user.create');
    expect(seller.permissions).not.toContain('role.create');
    expect(accountant.permissions).not.toContain('sale.update');
    expect(auditor.permissions.every((code) => code.endsWith('.read') || code === 'audit.read')).toBe(true);
  });

  it('does not grant tenant roles platform subscription permissions', () => {
    for (const role of STANDARD_TENANT_ROLES) {
      expect(role.permissions).not.toContain('organization.subscription.manage');
    }
  });
});
