import { describe, expect, it } from 'vitest';
import { STANDARD_TENANT_ROLES } from '@omnikes/lib/rbac/standard-tenant-roles';

describe('standard tenant RBAC roles', () => {
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
