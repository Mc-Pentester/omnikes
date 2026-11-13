import { describe, expect, it } from 'vitest';
import { ADMIN_ROLE, CASHIER_ROLE, PLATFORM_PERMISSIONS, STANDARD_TENANT_ROLES, TENANT_PERMISSION_CODES } from '@omnikes/lib/rbac/standard-tenant-roles';
import catalog from '../../../config/rbac-catalog.json';
describe('standard tenant RBAC roles', () => {
  it('derives every tenant role and permission from the canonical installer catalogue', () => {
    expect(TENANT_PERMISSION_CODES).toEqual(catalog.permissionCodes);
    expect(ADMIN_ROLE.name).toBe('ADMIN');
    expect(ADMIN_ROLE.permissions).toBe('ALL_TENANT_PERMISSIONS');
    expect(CASHIER_ROLE.permissions).toEqual(catalog.standardRoles.find((role) => role.name === 'CASHIER')?.permissionCodes);
    expect(STANDARD_TENANT_ROLES.map((role) => role.name)).toEqual(catalog.standardRoles.filter((role) => !['ADMIN', 'CASHIER'].includes(role.name)).map((role) => role.name));
    expect(new Set(TENANT_PERMISSION_CODES).size).toBe(TENANT_PERMISSION_CODES.length);
    for (const role of [CASHIER_ROLE, ...STANDARD_TENANT_ROLES]) for (const permission of role.permissions) expect(TENANT_PERMISSION_CODES).toContain(permission);
    expect(PLATFORM_PERMISSIONS.map((permission) => permission.code)).toEqual(['organization.subscription.manage']);
    expect(TENANT_PERMISSION_CODES).not.toContain('organization.subscription.manage');
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
    for (const role of [CASHIER_ROLE, ...STANDARD_TENANT_ROLES]) expect(role.permissions).not.toContain('organization.subscription.manage');
  });
});
