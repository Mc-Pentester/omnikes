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
    const salesAssociate = STANDARD_TENANT_ROLES.find((role) => role.name === 'SALES_ASSOCIATE')!;
    const accountant = STANDARD_TENANT_ROLES.find((role) => role.name === 'ACCOUNTANT')!;
    const auditor = STANDARD_TENANT_ROLES.find((role) => role.name === 'AUDITOR')!;
    expect(CASHIER_ROLE.permissions).toContain('customer.read');
    expect(CASHIER_ROLE.permissions).toContain('sale.customer.assign');
    expect(CASHIER_ROLE.permissions).toContain('sale.pos.sync');
    expect(CASHIER_ROLE.permissions).not.toContain('sale.update');
    expect(manager.permissions).not.toContain('backup.restore');
    expect(seller.permissions).not.toContain('user.create');
    expect(seller.permissions).not.toContain('role.create');
    expect(salesAssociate.permissions).toContain('sale.customer.assign');
    for (const roleName of ['MANAGER', 'SALES_MANAGER', 'STORE_MANAGER', 'SELLER']) {
      expect(STANDARD_TENANT_ROLES.find((role) => role.name === roleName)?.permissions).toContain('sale.pos.sync');
    }
    expect(accountant.permissions).not.toContain('sale.update');
    expect(auditor.permissions.every((code) => code.endsWith('.read') || code.endsWith('.view') || code === 'audit.read')).toBe(true);
  });
  it('grants customer-credit capabilities according to the least-privilege role matrix', () => {
    const role = (name: string) => name === 'CASHIER' ? CASHIER_ROLE.permissions : STANDARD_TENANT_ROLES.find((item) => item.name === name)!.permissions;
    const creditPermissions = [
      'credit.approve', 'credit.request', 'credit.payment.receive', 'credit.view',
      'credit.history.view', 'credit.report.view', 'credit.limit.manage', 'credit.settings.manage',
    ];
    for (const code of creditPermissions) expect(TENANT_PERMISSION_CODES).toContain(code);

    for (const name of ['MANAGER', 'SUPERVISOR', 'SALES_MANAGER', 'STORE_MANAGER']) {
      expect(role(name)).toContain('credit.approve');
      expect(role(name)).toContain('credit.view');
    }
    for (const name of ['CASHIER', 'SELLER', 'SALES_ASSOCIATE']) {
      expect(role(name)).toContain('credit.request');
      expect(role(name)).not.toContain('credit.approve');
    }
    for (const name of ['ACCOUNTANT', 'AUDITOR']) {
      expect(role(name)).toContain('credit.view');
      expect(role(name)).toContain('credit.history.view');
      expect(role(name)).toContain('credit.report.view');
      expect(role(name)).not.toContain('credit.approve');
      expect(role(name)).not.toContain('credit.payment.receive');
    }
    expect(role('MANAGER')).not.toContain('credit.settings.manage');
    expect(role('CASHIER')).not.toContain('credit.limit.manage');
  });
  it('does not grant tenant roles platform subscription permissions', () => {
    for (const role of [CASHIER_ROLE, ...STANDARD_TENANT_ROLES]) expect(role.permissions).not.toContain('organization.subscription.manage');
  });
});
