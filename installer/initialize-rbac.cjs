/* eslint-disable @typescript-eslint/no-require-imports */
// Idempotent, data-preserving RBAC catalogue initializer for Windows installs.
// Safe to run again on an existing installation; creates no users, organizations,
// roles, or demo data.
const path = require('node:path');
const app = path.resolve(__dirname, '..', 'app');

require(path.join(app, 'node_modules', 'dotenv')).config({ path: path.join(app, '.env') });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to initialize the RBAC catalogue.');

const { PrismaClient } = require(path.join(app, 'node_modules', '@prisma', 'client'));
const { PrismaPg } = require(path.join(app, 'node_modules', '@prisma', 'adapter-pg'));

const rbacCatalog = require(path.join(app, 'standard-tenant-rbac.json'));
const permissionCodes = rbacCatalog.tenantPermissions;
const cashierPermissionCodes = rbacCatalog.cashierRole.permissions;
const standardTenantRoles = rbacCatalog.standardTenantRoles;

function moduleFromCode(code) {
  const prefix = code.split('.')[0];
  if (prefix === 'sale' || prefix === 'payment') return 'sales';
  if (prefix === 'report') return 'reports';
  return prefix;
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
  log: ['error'],
});

async function main() {
  await prisma.$transaction(async (tx) => {
    for (const code of permissionCodes) {
      await tx.permission.upsert({
        where: { code },
        update: {},
        create: {
          code,
          description: 'Permission ' + code,
          module: moduleFromCode(code),
        },
      });
    }

    for (const permission of rbacCatalog.platformPermissions) {
      await tx.platformPermission.upsert({
        where: { code: permission.code },
        update: {},
        create: permission,
      });
    }
  });

  const count = await prisma.permission.count();
  if (count === 0) throw new Error('RBAC initialization failed: permission catalogue is empty.');

  // Upgrade-safe tenant bootstrap: add CASHIER only when the organization has
  // no role with that name. Existing custom roles and assignments are never
  // rewritten or deleted. Registration creates the same role for new tenants.
  const organizations = await prisma.organization.findMany({ select: { id: true } });
  for (const organization of organizations) {
    await prisma.$transaction(async (tx) => {
      const existingCashier = await tx.role.findFirst({
        where: { organizationId: organization.id, name: 'CASHIER' },
        select: { id: true },
      });
      if (existingCashier) return;

      const permissions = await tx.permission.findMany({
        where: { code: { in: cashierPermissionCodes } },
        select: { id: true, code: true },
      });
      if (permissions.length !== cashierPermissionCodes.length) {
        throw new Error('RBAC initialization failed: cashier permission catalogue is incomplete for organization ' + organization.id);
      }

      const cashierRole = await tx.role.create({
        data: {
          organizationId: organization.id,
          name: 'CASHIER',
          description: 'Accès opérationnel de caisse sans administration',
          isGlobal: true,
        },
        select: { id: true },
      });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: cashierRole.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });
    });
  }

  // Add missing standard organization roles without changing existing roles,
  // custom permissions, or user assignments.
  for (const organization of organizations) {
    for (const definition of standardTenantRoles) {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.role.findFirst({
          where: { organizationId: organization.id, name: definition.name },
          select: { id: true },
        });
        if (existing) return;
        const permissions = await tx.permission.findMany({
          where: { code: { in: definition.permissions } },
          select: { id: true, code: true },
        });
        if (permissions.length !== definition.permissions.length) {
          throw new Error('RBAC initialization failed: incomplete permissions for role ' + definition.name);
        }
        const role = await tx.role.create({
          data: { organizationId: organization.id, name: definition.name, description: definition.description, isGlobal: true },
          select: { id: true },
        });
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
          skipDuplicates: true,
        });
      });
    }
  }

  console.log('OmniKès RBAC catalogue initialized from shared catalogue: ' + permissionCodes.length + ' tenant permissions defined; ' + count + ' present; standard roles provisioned without overwriting existing roles.');
}

main()
  .catch((error) => {
    console.error('OmniKès RBAC catalogue initialization failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
