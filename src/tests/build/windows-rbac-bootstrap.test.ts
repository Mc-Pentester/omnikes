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
    expect(standardRoles).toContain("name: 'ADMIN'");
    expect(standardRoles).toContain("name: 'MANAGER'");
    expect(standardRoles).toContain("name: 'SUPERVISOR'");
    expect(standardRoles).toContain("name: 'CASHIER'");
    expect(standardRoles).toContain("name: 'SALES_ASSOCIATE'");
    expect(standardRoles).toContain("name: 'INVENTORY_MANAGER'");
    expect(standardRoles).toContain("name: 'WAREHOUSE_CLERK'");
    expect(standardRoles).toContain("name: 'PURCHASING_MANAGER'");
    expect(standardRoles).toContain("name: 'ACCOUNTANT'");
    expect(standardRoles).toContain("name: 'SALES_MANAGER'");
    expect(standardRoles).toContain("name: 'CUSTOMER_SERVICE'");
    expect(standardRoles).toContain('Never overwrite a customized role');
  });

  it('defaults new employee accounts to CASHIER instead of the privileged ADMIN role', () => {
    expect(usersPage).toContain("roles.find((role) => role.name === 'CASHIER')");
    expect(usersPage).not.toContain('const firstGlobal = roles.find((role) => role.isGlobal)');
  });

  it('upserts the permission catalog and repairs only missing standard roles without overwriting existing data', () => {
    expect(initializer).toContain('tx.permission.upsert');
    expect(initializer).toContain('tx.platformPermission.upsert');
    expect(initializer).toContain("'store.create'");
    expect(initializer).toContain("'supplier.payment.manage'");
    expect(initializer).toContain("'organization.subscription.manage'");
    expect(initializer).toContain('await prisma.permission.count()');
    expect(initializer).toContain('const standardRoles = [');
    expect(initializer).toContain("name: 'CUSTOMER_SERVICE'");
    expect(initializer).toContain('where: { organizationId: organization.id, name: definition.name, isGlobal: true, storeId: null }');
    expect(initializer).toContain('tx.role.create');
    expect(initializer).toContain('tx.rolePermission.createMany');
    expect(initializer).toContain("'sale.create'");
    expect(initializer).toContain("'cash.movement'");
    expect(initializer).not.toMatch(/tx\.(organization|user)\.create\s*\(/);
    expect(initializer).not.toContain('deleteMany');
    expect(initializer).not.toContain('drop database');
  });
});
