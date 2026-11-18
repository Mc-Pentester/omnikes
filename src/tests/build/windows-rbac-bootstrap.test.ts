import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const initializer = readFileSync(path.join(root, 'installer', 'initialize-rbac.cjs'), 'utf8');
const runtime = readFileSync(path.join(root, 'installer', 'install-runtime.cjs'), 'utf8');
const packaging = readFileSync(path.join(root, 'scripts', 'package-windows.ps1'), 'utf8');
const registration = readFileSync(path.join(root, 'src', 'services', 'registration.service.ts'), 'utf8');
const catalogue = JSON.parse(
  readFileSync(path.join(root, 'src', 'lib', 'rbac', 'standard-tenant-rbac.json'), 'utf8'),
);

describe('Windows installer RBAC bootstrap', () => {
  it('runs the idempotent permission initializer after Prisma migrations', () => {
    expect(runtime).toContain("run(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schema], { ...process.env, DATABASE_URL: url }, app)");
    expect(runtime).toContain("path.join(__dirname, 'initialize-rbac.cjs')");
    expect(runtime.indexOf("migrate', 'deploy")).toBeLessThan(runtime.indexOf("path.join(__dirname, 'initialize-rbac.cjs')"));
  });

  it('includes the initializer and shared RBAC catalogue in the offline Windows installer payload', () => {
    expect(packaging).toContain('Copy-Item "installer\\initialize-rbac.cjs" $installer -Force');
    expect(packaging).toContain('src\\lib\\rbac\\standard-tenant-rbac.json');
    expect(packaging).toContain('standard-tenant-rbac.json');
  });

  it('creates tenant-scoped standard roles from the shared catalogue during registration', () => {
    expect(registration).toContain("from '@omnikes/lib/rbac/standard-tenant-roles'");
    expect(registration).toContain('TENANT_PERMISSION_CODES');
    expect(registration).toContain('CASHIER_ROLE.permissions');
    expect(registration).toContain('provisionStandardTenantRoles(tx, organization.id)');
    expect(registration).toContain("name: CASHIER_ROLE.name");
    expect(registration).toContain('tx.rolePermission.createMany');

    expect(catalogue.tenantPermissions).toContain('store.create');
    expect(catalogue.tenantPermissions).toContain('supplier.payment.manage');
    expect(catalogue.cashierRole.permissions).toContain('sale.create');
    expect(catalogue.cashierRole.permissions).toContain('cash.movement');
    expect(catalogue.adminRole.permissions).toBe('ALL_TENANT_PERMISSIONS');
  });

  it('upserts the shared permission catalog and repairs only missing least-privilege roles', () => {
    expect(initializer).toContain("require(path.join(app, 'standard-tenant-rbac.json'))");
    expect(initializer).toContain('rbacCatalog.tenantPermissions');
    expect(initializer).toContain('rbacCatalog.cashierRole.permissions');
    expect(initializer).toContain('rbacCatalog.standardTenantRoles');
    expect(initializer).toContain('rbacCatalog.platformPermissions');
    expect(initializer).toContain('tx.permission.upsert');
    expect(initializer).toContain('tx.platformPermission.upsert');
    expect(initializer).toContain('await prisma.permission.count()');
    expect(initializer).toContain("where: { organizationId: organization.id, name: 'CASHIER' }");
    expect(initializer).toContain('tx.role.create');
    expect(initializer).toContain('tx.rolePermission.createMany');
    expect(initializer).not.toMatch(/tx\.(organization|user)\.create\s*\(/);
    expect(initializer).not.toContain('deleteMany');
    expect(initializer).not.toContain('drop database');

    expect(catalogue.platformPermissions.map((permission: { code: string }) => permission.code))
      .toContain('organization.subscription.manage');
    expect(catalogue.standardTenantRoles.length).toBeGreaterThan(0);
  });
});
