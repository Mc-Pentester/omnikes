/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');

const home = path.resolve(__dirname, '..');
const app = path.join(home, 'app');
const configPath = process.argv[2];

const PERMISSION_CODES = [
  'store.create','store.read','store.update','store.activate','store.deactivate','store.delete',
  'proforma.create','proforma.read','proforma.update','proforma.accept','proforma.cancel','proforma.convert',
  'customer.create','customer.read','customer.update','customer.delete',
  'sale.create','sale.read','sale.update','sale.complete','sale.credit','sale.cancel','sale.return',
  'payment.create','payment.read','payment.refund',
  'cash.read','cash.open','cash.close','cash.movement',
  'inventory.read','inventory.adjust',
  'product.manage','product.read','report.read',
  'organization.read','organization.update',
  'backup.create','backup.restore','hardware.bridge.read','tax.manage',
  'user.read','user.create','user.update',
  'role.read','role.create','role.update','audit.read',
  'supplier.read','supplier.manage','purchase.read','purchase.manage','purchase.receive',
  'supplier.payment.manage','supplier.payment.read',
];

function moduleFromCode(code) {
  const prefix = code.split('.')[0];
  return prefix === 'sale' || prefix === 'payment' ? 'sales' : prefix;
}

function readConfig(file) {
  if (!file || !fs.existsSync(file)) {
    throw new Error('Initial setup configuration is missing. Rerun the installer and complete the setup page.');
  }
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

async function main() {
  const config = readConfig(configPath);
  const organizationName = config.OMNIKES_INSTALL_ORGANIZATION_NAME?.trim();
  const storeName = config.OMNIKES_INSTALL_STORE_NAME?.trim() || 'Magasin principal';
  const adminName = config.OMNIKES_INSTALL_ADMIN_NAME?.trim();
  const adminEmail = config.OMNIKES_INSTALL_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = config.OMNIKES_INSTALL_ADMIN_PASSWORD || '';

  if (!organizationName || organizationName.length > 255) throw new Error('The organization name is required and must not exceed 255 characters.');
  if (!storeName || storeName.length > 255) throw new Error('The store name is required and must not exceed 255 characters.');
  if (!adminName || adminName.length > 255) throw new Error('The administrator name is required and must not exceed 255 characters.');
  if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new Error('A valid administrator email is required.');
  if (adminPassword.length < 12) throw new Error('The administrator password must contain at least 12 characters.');

  const { PrismaClient, Prisma } = require(path.join(app, 'node_modules', '@prisma', 'client'));
  const { PrismaPg } = require(path.join(app, 'node_modules', '@prisma', 'adapter-pg'));
  const bcrypt = require(path.join(app, 'node_modules', 'bcryptjs'));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for first-run setup.');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }), log: ['error'] });
  try {
    const existingUsers = await prisma.user.count();
    if (existingUsers > 0) {
      console.log('Existing OmniKès users found; organization and accounts preserved. Initial provisioning skipped.');
      return;
    }

    const slugBase = organizationName.toLowerCase().normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').slice(0, 80);
    if (!slugBase) throw new Error('The organization name cannot be converted to a valid identifier.');

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(81427362)`);
      if (await tx.user.count() > 0) {
        throw new Error('An administrator was created concurrently; no initial data was changed.');
      }

      let slug = slugBase;
      let suffix = 2;
      while (await tx.organization.findUnique({ where: { slug }, select: { id: true } })) {
        slug = `${slugBase}-${suffix++}`;
      }

      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          slug,
          country: 'HT',
          currency: 'HTG',
          locale: 'fr-HT',
          timezone: 'America/Port-au-Prince',
          cloudEnabled: false,
          onlineStoreEnabled: false,
        },
      });

      const store = await tx.store.create({
        data: {
          organizationId: organization.id,
          name: storeName,
          code: 'MAIN',
          country: organization.country,
          isActive: true,
        },
      });

      const permissions = [];
      for (const code of PERMISSION_CODES) {
        permissions.push(await tx.permission.upsert({
          where: { code },
          update: {},
          create: { code, description: `Permission ${code}`, module: moduleFromCode(code) },
        }));
      }

      const role = await tx.role.create({
        data: {
          organizationId: organization.id,
          name: 'ADMIN',
          description: 'Administrateur de l’organisation',
          isGlobal: false,
        },
      });
      for (const permission of permissions) {
        await tx.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
      }

      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: adminEmail,
          name: adminName,
          password: await bcrypt.hash(adminPassword, 12),
          isActive: true,
          userRoles: { create: { roleId: role.id } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          action: 'LOCAL_INSTALLATION_COMPLETED',
          module: 'installation',
          entityId: organization.id,
          entityType: 'Organization',
          metadata: { localFirst: true, storeId: store.id, permissionCount: permissions.length },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    console.log('First-run setup completed. Cloud and online store remain disabled; no demo data was created.');
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error('OmniKès first-run setup failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (configPath && fs.existsSync(configPath)) {
      try { fs.unlinkSync(configPath); } catch { /* Best-effort cleanup of temporary credentials. */ }
    }
  });
