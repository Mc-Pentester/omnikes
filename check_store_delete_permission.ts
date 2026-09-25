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
  console.log('🔍 Diagnostic: Vérification de la permission store.delete');

  // 1. Vérifier la permission store.delete
  const storeDeletePermission = await prisma.permission.findUnique({
    where: { code: 'store.delete' },
  });

  console.log('\n📦 Permission store.delete:', storeDeletePermission ? '✅ EXISTE' : '❌ N\'EXISTE PAS');
  if (storeDeletePermission) {
    console.log(`   ID: ${storeDeletePermission.id}`);
    console.log(`   Description: ${storeDeletePermission.description}`);
  }

  // 2. Vérifier si admin-role-a a cette permission
  const adminRoleA = await prisma.role.findUnique({
    where: { id: 'admin-role-a' },
    include: {
      rolePermissions: {
        include: {
          permission: true,
        },
      },
    },
  });

  if (adminRoleA) {
    const hasStoreDelete = adminRoleA.rolePermissions.some(
      rp => rp.permission.code === 'store.delete'
    );
    console.log('\n🏢 Rôle admin-role-a a store.delete:', hasStoreDelete ? '✅ OUI' : '❌ NON');

    console.log('\n📋 Toutes les permissions store de admin-role-a:');
    const storePermissions = adminRoleA.rolePermissions
      .filter(rp => rp.permission.module === 'store')
      .map(rp => rp.permission.code);
    storePermissions.forEach(perm => console.log(`  - ${perm}`));
  }

  console.log('\n=== DIAGNOSTIC TERMINÉ ===');
}

main()
  .catch((e) => {
    console.error('Erreur:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
