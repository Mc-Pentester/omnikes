import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;

const prisma = new PrismaClient({
  adapter,
  log: ['error'],
});

async function main() {
  console.log('=== FORENSIC PERMISSIONS ===\n');

  // Check Proforma permissions
  const proformaPermissions = await prisma.permission.findMany({
    where: {
      code: {
        startsWith: 'proforma.'
      }
    }
  });

  console.log('Proforma permissions in DB:');
  if (proformaPermissions.length === 0) {
    console.log('(empty)');
  } else {
    for (const perm of proformaPermissions) {
      console.log(`- ${perm.code} (${perm.description})`);
    }
  }

  // Check Customer permissions
  const customerPermissions = await prisma.permission.findMany({
    where: {
      code: {
        startsWith: 'customer.'
      }
    }
  });

  console.log('\nCustomer permissions in DB:');
  if (customerPermissions.length === 0) {
    console.log('(empty)');
  } else {
    for (const perm of customerPermissions) {
      console.log(`- ${perm.code} (${perm.description})`);
    }
  }

  // Check total counts
  const totalPermissions = await prisma.permission.count();
  const totalRolePermissions = await prisma.rolePermission.count();

  console.log(`\nTotal permissions in DB: ${totalPermissions}`);
  console.log(`Total role-permission associations: ${totalRolePermissions}`);

  // Check if user has proforma.read permission
  const proformaReadPerm = await prisma.permission.findUnique({
    where: { code: 'proforma.read' }
  });

  if (proformaReadPerm) {
    const adminRoleA = await prisma.role.findUnique({ where: { id: 'admin-role-a' } });
    if (adminRoleA) {
      const hasPerm = await prisma.rolePermission.findFirst({
        where: {
          roleId: adminRoleA.id,
          permissionId: proformaReadPerm.id
        }
      });
      console.log(`\nadmin-role-a has proforma.read: ${hasPerm ? 'YES' : 'NO'}`);
    }
  }

  // Check if user has customer.read permission
  const customerReadPerm = await prisma.permission.findUnique({
    where: { code: 'customer.read' }
  });

  if (customerReadPerm) {
    const adminRoleA = await prisma.role.findUnique({ where: { id: 'admin-role-a' } });
    if (adminRoleA) {
      const hasPerm = await prisma.rolePermission.findFirst({
        where: {
          roleId: adminRoleA.id,
          permissionId: customerReadPerm.id
        }
      });
      console.log(`admin-role-a has customer.read: ${hasPerm ? 'YES' : 'NO'}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
