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

const permissionCodes = [
  'store.create', 'store.read', 'store.update', 'store.activate', 'store.deactivate', 'store.delete',
  'proforma.create', 'proforma.read', 'proforma.update', 'proforma.accept', 'proforma.cancel', 'proforma.convert',
  'customer.create', 'customer.read', 'customer.update', 'customer.delete',
  'sale.create', 'sale.read', 'sale.update', 'sale.complete', 'sale.credit', 'sale.cancel', 'sale.return',
  'payment.create', 'payment.read', 'payment.refund',
  'cash.read', 'cash.open', 'cash.close', 'cash.movement',
  'inventory.read', 'inventory.adjust',
  'product.manage', 'product.read', 'report.read',
  'organization.read', 'organization.update',
  'backup.create', 'backup.restore', 'hardware.bridge.read', 'tax.manage',
  'user.read', 'user.create', 'user.update',
  'role.read', 'role.create', 'role.update', 'audit.read',
  'supplier.read', 'supplier.manage', 'purchase.read', 'purchase.manage', 'purchase.receive',
  'supplier.payment.manage', 'supplier.payment.read',
];

// Standard tenant roles use the same permission codes as the registration service.
// Existing roles are deliberately left untouched so local customizations survive upgrades.
const standardRoles = [
  { name: 'ADMIN', description: 'Administration complète de l’organisation et de ses magasins', permissionCodes: null },
  { name: 'MANAGER', description: 'Gestion quotidienne des magasins et supervision des opérations', permissionCodes: ['store.read','store.update','product.manage','product.read','customer.create','customer.read','customer.update','customer.delete','sale.create','sale.read','sale.update','sale.complete','sale.credit','sale.cancel','sale.return','payment.create','payment.read','payment.refund','cash.read','cash.open','cash.close','cash.movement','inventory.read','inventory.adjust','report.read','user.read','user.create','user.update','audit.read','supplier.read','supplier.manage','purchase.read','purchase.manage','purchase.receive','supplier.payment.read','supplier.payment.manage','proforma.create','proforma.read','proforma.update','proforma.accept','proforma.cancel','proforma.convert','organization.read'] },
  { name: 'SUPERVISOR', description: 'Supervision des ventes, caisses et employés du magasin', permissionCodes: ['store.read','product.read','customer.read','customer.create','customer.update','sale.read','sale.update','sale.complete','sale.cancel','sale.return','payment.read','payment.refund','cash.read','cash.close','cash.movement','inventory.read','report.read','user.read','audit.read','proforma.read'] },
  { name: 'CASHIER', description: 'Encaissement des ventes et opérations courantes de caisse', permissionCodes: ['sale.create','sale.read','sale.complete','payment.create','payment.read','product.read','inventory.read','store.read','cash.read','cash.open','cash.close','cash.movement'] },
  { name: 'SALES_ASSOCIATE', description: 'Vente, suivi des clients et préparation des proformas', permissionCodes: ['sale.create','sale.read','customer.create','customer.read','customer.update','product.read','inventory.read','proforma.create','proforma.read','proforma.update','proforma.accept','store.read'] },
  { name: 'INVENTORY_MANAGER', description: 'Gestion des produits, inventaires et réceptions', permissionCodes: ['inventory.read','inventory.adjust','product.manage','product.read','purchase.read','purchase.receive','supplier.read','report.read','store.read'] },
  { name: 'WAREHOUSE_CLERK', description: 'Réception, rangement et mouvements physiques des marchandises', permissionCodes: ['inventory.read','product.read','purchase.read','purchase.receive','store.read'] },
  { name: 'PURCHASING_MANAGER', description: 'Gestion des fournisseurs, commandes et achats', permissionCodes: ['supplier.read','supplier.manage','purchase.read','purchase.manage','purchase.receive','supplier.payment.read','supplier.payment.manage','product.read','inventory.read','store.read','report.read'] },
  { name: 'ACCOUNTANT', description: 'Consultation des opérations comptables et rapports financiers', permissionCodes: ['report.read','sale.read','payment.read','cash.read','purchase.read','supplier.payment.read','customer.read','audit.read','store.read'] },
  { name: 'SALES_MANAGER', description: 'Pilotage commercial, clients, ventes et proformas', permissionCodes: ['sale.create','sale.read','sale.update','sale.complete','sale.credit','customer.create','customer.read','customer.update','customer.delete','proforma.create','proforma.read','proforma.update','proforma.accept','proforma.cancel','proforma.convert','report.read','product.read','inventory.read','store.read'] },
  { name: 'CUSTOMER_SERVICE', description: 'Service clientèle, suivi des clients et traitement des demandes', permissionCodes: ['customer.create','customer.read','customer.update','sale.read','sale.return','payment.read','proforma.read','product.read','store.read'] },
];

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
