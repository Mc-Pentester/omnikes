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

const rbacCatalog = require(path.join(__dirname, 'rbac-catalog.json'));
const permissionCodes = rbacCatalog.permissionCodes;
const standardRoles = rbacCatalog.standardRoles;

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

    await tx.platformPermission.upsert({
      where: { code: 'organization.subscription.manage' },
      update: {},
      create: {
        code: 'organization.subscription.manage',
        description: 'Activer, renouveler ou annuler l’abonnement OmniKès pour une organisation',
        module: 'subscription',
      },
    });
  });

  const count = await prisma.permission.count();
  if (count === 0) throw new Error('RBAC initialization failed: permission catalogue is empty.');

  // Upgrade-safe tenant bootstrap: provision any missing standard roles.
  // Existing roles and permissions are never overwritten or deleted.
  const organizations = await prisma.organization.findMany({ select: { id: true } });
  for (const organization of organizations) {
    await prisma.$transaction(async (tx) => {
      const catalog = await tx.permission.findMany({ select: { id: true, code: true } });

      for (const definition of standardRoles) {
        const existing = await tx.role.findFirst({
          where: { organizationId: organization.id, name: definition.name, isGlobal: true, storeId: null },
          select: { id: true },
        });
        if (existing) continue;

        const selectedPermissions = definition.permissionCodes === null
          ? catalog
          : definition.permissionCodes.map((code) => {
              const permission = catalog.find((item) => item.code === code);
              if (!permission) throw new Error('RBAC initialization failed: missing permission ' + code + ' for role ' + definition.name);
              return permission;
            });

        const role = await tx.role.create({
          data: {
            organizationId: organization.id,
            name: definition.name,
            description: definition.description,
            isGlobal: true,
            storeId: null,
          },
          select: { id: true },
        });
        await tx.rolePermission.createMany({
          data: selectedPermissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
          skipDuplicates: true,
        });
      }
    });
  }

  console.log('OmniKès RBAC catalogue initialized: ' + permissionCodes.length + ' tenant permissions defined; ' + count + ' present; missing cashier roles repaired without overwriting existing roles.');
}

main()
  .catch((error) => {
    console.error('OmniKès RBAC catalogue initialization failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
