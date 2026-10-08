import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter, log: ['error'] });

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
] as const;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function slugify(value: string): string {
  return value.trim().toLowerCase()
    .normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function moduleFromCode(code: string): string {
  const prefix = code.split('.')[0];
  return prefix === 'sale' ? 'sales' : prefix === 'payment' ? 'sales' : prefix;
}

async function main() {
  const organizationName = required('OMNIKES_INSTALL_ORGANIZATION_NAME');
  const adminEmail = required('OMNIKES_INSTALL_ADMIN_EMAIL').toLowerCase();
  const adminName = required('OMNIKES_INSTALL_ADMIN_NAME');
  const adminPassword = required('OMNIKES_INSTALL_ADMIN_PASSWORD');
  const storeName = process.env.OMNIKES_INSTALL_STORE_NAME?.trim() || 'Magasin principal';
  const storeCode = (process.env.OMNIKES_INSTALL_STORE_CODE?.trim() || 'MAIN').toUpperCase();

  if (!adminEmail.includes('@')) throw new Error('OMNIKES_INSTALL_ADMIN_EMAIL must be a valid email');
  if (adminPassword.length < 12) throw new Error('OMNIKES_INSTALL_ADMIN_PASSWORD must contain at least 12 characters');
  if (!organizationName || organizationName.length > 255) throw new Error('Invalid organization name');
  if (!storeCode || storeCode.length > 64) throw new Error('Invalid store code');

  const slugBase = slugify(organizationName);
  if (!slugBase) throw new Error('Organization name cannot produce a valid slug');

  await prisma.$queryRaw(Prisma.sql`SELECT 1`);

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(81427362)`);

    const existingUsers = await tx.user.count();
    if (existingUsers > 0) {
      throw new Error('Installation refused: users already exist in this database. This installer never modifies an existing installation.');
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
        country: process.env.OMNIKES_INSTALL_COUNTRY?.trim().toUpperCase() || 'HT',
        currency: process.env.OMNIKES_INSTALL_CURRENCY?.trim().toUpperCase() || 'HTG',
        locale: process.env.OMNIKES_INSTALL_LOCALE?.trim() || 'fr-HT',
        timezone: process.env.OMNIKES_INSTALL_TIMEZONE?.trim() || 'America/Port-au-Prince',
        cloudEnabled: false,
        onlineStoreEnabled: false,
      },
    });

    const store = await tx.store.create({
      data: {
        organizationId: organization.id,
        name: storeName,
        code: storeCode,
        country: organization.country,
        isActive: true,
      },
    });

    const permissions = [];
    for (const code of PERMISSION_CODES) {
      const permission = await tx.permission.upsert({
        where: { code },
        update: {},
        create: {
          code,
          description: `Permission ${code}`,
          module: moduleFromCode(code),
        },
      });
      permissions.push(permission);
    }

    const adminRole = await tx.role.create({
      data: {
        organizationId: organization.id,
        name: 'ADMIN',
        description: 'Administrateur de l’organisation',
        isGlobal: false,
      },
    });

    for (const permission of permissions) {
      await tx.rolePermission.create({
        data: { roleId: adminRole.id, permissionId: permission.id },
      });
    }

    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const admin = await tx.user.create({
      data: {
        organizationId: organization.id,
        email: adminEmail,
        name: adminName,
        password: passwordHash,
        isActive: true,
        userRoles: { create: { roleId: adminRole.id } },
      },
    });

    await tx.auditLog.create({
      data: {
        userId: admin.id,
        organizationId: organization.id,
        action: 'LOCAL_INSTALLATION_COMPLETED',
        module: 'installation',
        entityId: organization.id,
        entityType: 'Organization',
        metadata: { localFirst: true, storeId: store.id, permissionCount: permissions.length },
      },
    });

    return { organization, store, admin };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  console.log('OmniKès local installation completed.');
  console.log(`Organization: ${result.organization.name} (${result.organization.slug})`);
  console.log(`Store: ${result.store.name} [${result.store.code}]`);
  console.log(`Administrator: ${result.admin.email}`);
  console.log('Cloud: disabled');
  console.log('Online store: disabled');
  console.log('Test/demo data: none');
}

main()
  .catch((error) => {
    console.error('OmniKès local installation failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => { await prisma.$disconnect(); });
