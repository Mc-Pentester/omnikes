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
  console.log('OmniKès RBAC catalogue initialized: ' + permissionCodes.length + ' tenant permissions defined; ' + count + ' present.');
}

main()
  .catch((error) => {
    console.error('OmniKès RBAC catalogue initialization failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
