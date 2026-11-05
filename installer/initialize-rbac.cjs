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

// Standard operational role: can run the register and consult operational
// information, but cannot administer users, roles, organization settings,
// backups, purchases, or supplier payments.
const cashierPermissionCodes = [
  'sale.create', 'sale.read', 'sale.complete', 'sale.return',
  'payment.create', 'payment.read', 'payment.refund',
  'inventory.read', 'product.read', 'report.read', 'store.read',
  'cash.read', 'cash.open', 'cash.close', 'cash.movement',
];

const standardTenantRoles = [
  { name: 'MANAGER', description: 'Gestion quotidienne et supervision commerciale', permissions: ['store.read','store.update','product.manage','product.read','inventory.read','inventory.adjust','customer.create','customer.read','customer.update','customer.delete','proforma.create','proforma.read','proforma.update','proforma.accept','proforma.cancel','proforma.convert','sale.create','sale.read','sale.update','sale.complete','sale.credit','sale.cancel','sale.return','payment.create','payment.read','payment.refund','cash.read','cash.open','cash.close','cash.movement','report.read','supplier.read','supplier.manage','purchase.read','purchase.manage','purchase.receive','supplier.payment.manage','supplier.payment.read','user.read','user.create','user.update','role.read','audit.read','organization.read'] },
  { name: 'STORE_MANAGER', description: 'Gestion opérationnelle des magasins', permissions: ['store.read','product.manage','product.read','inventory.read','inventory.adjust','customer.create','customer.read','customer.update','proforma.create','proforma.read','proforma.update','proforma.accept','proforma.convert','sale.create','sale.read','sale.update','sale.complete','sale.credit','sale.cancel','sale.return','payment.create','payment.read','payment.refund','cash.read','cash.open','cash.close','cash.movement','report.read','supplier.read','purchase.read','purchase.receive'] },
  { name: 'SELLER', description: 'Ventes, devis et relation client', permissions: ['store.read','product.read','customer.create','customer.read','customer.update','proforma.create','proforma.read','proforma.update','sale.create','sale.read','sale.complete','payment.create','payment.read','inventory.read'] },
  { name: 'INVENTORY_MANAGER', description: 'Produits, stocks et inventaires', permissions: ['store.read','product.manage','product.read','inventory.read','inventory.adjust','report.read','purchase.read','purchase.receive'] },
  { name: 'PURCHASING_MANAGER', description: 'Fournisseurs, achats et réceptions', permissions: ['store.read','product.read','inventory.read','supplier.read','supplier.manage','purchase.read','purchase.manage','purchase.receive','supplier.payment.read'] },
  { name: 'ACCOUNTANT', description: 'Suivi comptable et financier', permissions: ['store.read','sale.read','payment.read','cash.read','report.read','customer.read','supplier.read','purchase.read','supplier.payment.read','audit.read'] },
  { name: 'AUDITOR', description: 'Consultation en lecture seule et traçabilité', permissions: ['store.read','product.read','inventory.read','customer.read','proforma.read','sale.read','payment.read','cash.read','report.read','organization.read','user.read','role.read','audit.read','supplier.read','purchase.read','supplier.payment.read'] },
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
