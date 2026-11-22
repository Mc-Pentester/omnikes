import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const initializer = readFileSync(path.join(root, 'installer', 'initialize-rbac.cjs'), 'utf8');
const platformBootstrap = readFileSync(path.join(root, 'scripts', 'bootstrap-platform-operator.ts'), 'utf8');
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

  it('provisions the dedicated technical organization and platform role without test seeding', () => {
    expect(platformBootstrap).toContain("name: 'OmniKès technique'");
    expect(platformBootstrap).toContain("slug: 'omnikes-platform-technical'");
    expect(platformBootstrap).toContain('prisma.organization.upsert');
    expect(platformBootstrap).toContain('PLATFORM_PERMISSIONS');
    expect(platformBootstrap).toContain('platformRole.upsert');
    expect(platformBootstrap).toContain('platformRolePermission.createMany');
    expect(platformBootstrap).toContain('platformOperatorBootstrapService.bootstrap');
    expect(platformBootstrap).toMatch(/update:\s*\{\s*description: 'Opérateur OmniKès autorisé à gérer les abonnements de la plateforme',\s*\}/);
    expect(platformBootstrap).toMatch(/create:\s*\{[\s\S]*?isActive: true,/);
    expect(platformBootstrap).toContain('if (!role.isActive)');
    expect(platformBootstrap).toContain('an administrator must explicitly reactivate it before bootstrap');
    expect(platformBootstrap.indexOf("required('BOOTSTRAP_PLATFORM_OPERATOR_PASSWORD')")).toBeLessThan(platformBootstrap.indexOf('await ensurePlatformRoleAndPermissions()'));
    expect(platformBootstrap.indexOf('await ensurePlatformRoleAndPermissions()')).toBeLessThan(platformBootstrap.indexOf('await ensurePlatformOrganization()'));
    expect(platformBootstrap).toContain("required('BOOTSTRAP_PLATFORM_OPERATOR_PASSWORD', { trim: false })");
    expect(platformBootstrap).toContain('options.trim === false ? rawValue : rawValue?.trim()');
    expect(platformBootstrap).toContain('BOOTSTRAP_PLATFORM_OPERATOR_PASSWORD must be at least 8 characters');
    expect(platformBootstrap).not.toContain('BOOTSTRAP_PLATFORM_OPERATOR_ORGANIZATION_ID');
    expect(initializer).toContain("name: 'OMNIKES_PLATFORM_OPERATOR'");
    expect(initializer).toMatch(/update:\s*\{\s*description: 'Opérateur OmniKès autorisé à gérer les abonnements de la plateforme',\s*\}/);
    expect(initializer).toMatch(/create:\s*\{\s*name: 'OMNIKES_PLATFORM_OPERATOR',\s*description: 'Opérateur OmniKès autorisé à gérer les abonnements de la plateforme',\s*isActive: true,/);
    expect(initializer).toContain('tx.platformRolePermission.createMany');
    expect(initializer).toContain('skipDuplicates: true');
  });

  it('uses the shared permission and role catalog without overwriting existing data', () => {
    expect(initializer).toContain('rbacCatalog.permissionCodes');
    expect(initializer).toContain('rbacCatalog.standardRoles');
    expect(initializer).toContain('rbac-catalog.json');
    expect(initializer).toContain('tx.permission.upsert');
    expect(initializer).toContain('tx.platformPermission.upsert');
    expect(initializer).toContain('rbacCatalog.platformPermissions');
    expect(initializer).not.toContain("where: { code: 'organization.subscription.manage' }");
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
