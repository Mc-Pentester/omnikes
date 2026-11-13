import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const initializer = readFileSync(path.join(root, 'installer', 'initialize-rbac.cjs'), 'utf8');
const runtime = readFileSync(path.join(root, 'installer', 'install-runtime.cjs'), 'utf8');
const packaging = readFileSync(path.join(root, 'scripts', 'package-windows.ps1'), 'utf8');
const registration = readFileSync(path.join(root, 'src', 'services', 'registration.service.ts'), 'utf8');
const standardRoles = readFileSync(path.join(root, 'src', 'lib', 'rbac', 'standard-organization-roles.ts'), 'utf8');
const usersPage = readFileSync(path.join(root, 'src', 'app', 'administration', 'users', 'page.tsx'), 'utf8');
const lifecycle = readFileSync(path.join(root, 'scripts', 'test-windows-installer-lifecycle.ps1'), 'utf8');
const rbacCatalog = JSON.parse(readFileSync(path.join(root, 'config', 'rbac-catalog.json'), 'utf8')) as { permissionCodes: string[]; standardRoles: Array<{ name: string }> };

describe('Windows installer RBAC bootstrap', () => {
  it('runs the idempotent permission initializer after Prisma migrations', () => {
    expect(runtime).toContain("run(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schema], { ...process.env, DATABASE_URL: url }, app)");
    expect(runtime).toContain("path.join(__dirname, 'initialize-rbac.cjs')");
    expect(runtime.indexOf("migrate', 'deploy")).toBeLessThan(runtime.indexOf("path.join(__dirname, 'initialize-rbac.cjs')"));
  });

  it('includes the initializer in the offline Windows installer payload', () => {
    expect(packaging).toContain('Copy-Item "installer\\initialize-rbac.cjs" $installer -Force');
  });

  it('provisions the complete tenant role catalogue atomically during first registration', () => {
    expect(registration).toContain('provisionStandardOrganizationRoles(tx, organization.id)');
    expect(registration).toContain('roleId: adminRoleId');
    expect(standardRoles).toContain('rbacCatalog.standardRoles');
    expect(standardRoles).toContain('never overwrite their permissions or description');
    expect(lifecycle).toContain('$baseUrl/api/admin/roles');
    expect(lifecycle).toContain('FIRST ORGANIZATION STANDARD RBAC ROLES: PASS');
    expect(rbacCatalog.standardRoles.map((role) => role.name)).toEqual(expect.arrayContaining([
      'ADMIN', 'MANAGER', 'SUPERVISOR', 'CASHIER', 'SALES_ASSOCIATE',
      'INVENTORY_MANAGER', 'WAREHOUSE_CLERK', 'PURCHASING_MANAGER',
      'ACCOUNTANT', 'SALES_MANAGER', 'CUSTOMER_SERVICE',
      'STORE_MANAGER', 'SELLER', 'AUDITOR',
    ]));
  });

  it('defaults new employee accounts to CASHIER instead of the privileged ADMIN role', () => {
    expect(usersPage).toContain("roles.find((role) => role.name === 'CASHIER')");
    expect(usersPage).not.toContain('const firstGlobal = roles.find((role) => role.isGlobal)');
  });

  it('uses the shared permission and role catalog without overwriting existing data', () => {
    expect(initializer).toContain('rbacCatalog.permissionCodes');
    expect(initializer).toContain('rbacCatalog.standardRoles');
    expect(initializer).toContain('rbac-catalog.json');
    expect(initializer).toContain('tx.permission.upsert');
    expect(initializer).toContain('tx.platformPermission.upsert');
    expect(initializer).toContain("'organization.subscription.manage'");
    expect(initializer).toContain('await prisma.permission.count()');
    expect(initializer).toContain('where: { organizationId: organization.id, name: definition.name, isGlobal: true, storeId: null }');
    expect(initializer).toContain('tx.role.create');
    expect(initializer).toContain('tx.rolePermission.createMany');
    expect(initializer).not.toMatch(/tx\.(organization|user)\.create\s*\(/);
    expect(initializer).not.toContain('deleteMany');
    expect(initializer).not.toContain('drop database');
    expect(rbacCatalog.permissionCodes).toContain('store.create');
    expect(rbacCatalog.permissionCodes).toContain('supplier.payment.manage');
    expect(rbacCatalog.permissionCodes).toContain('sale.create');
    expect(rbacCatalog.permissionCodes).toContain('cash.movement');
    expect(packaging).toContain('config\\rbac-catalog.json');
  });
});
