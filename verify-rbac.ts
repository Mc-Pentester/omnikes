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
  console.log('🔍 Vérification RBAC post-seed...\n');

  // 1. Vérifier permission store.create
  console.log('=== 1. Permission store.create ===');
  const storeCreatePermission = await prisma.permission.findUnique({
    where: { code: 'store.create' },
  });
  if (storeCreatePermission) {
    console.log('✅ Permission store.create existe:');
    console.log(`   ID: ${storeCreatePermission.id}`);
    console.log(`   Code: ${storeCreatePermission.code}`);
    console.log(`   Description: ${storeCreatePermission.description}`);
    console.log(`   Module: ${storeCreatePermission.module}`);
  } else {
    console.log('❌ Permission store.create NON TROUVÉE');
  }

  // 2. Vérifier RolePermission pour store.create
  console.log('\n=== 2. RolePermission pour store.create ===');
  const rolePermissions = await prisma.rolePermission.findMany({
    where: { permissionId: storeCreatePermission?.id },
    include: { role: true },
  });
  console.log('Rôles avec store.create:');
  for (const rp of rolePermissions) {
    console.log(`   - ${rp.role.name} (id: ${rp.role.id})`);
  }

  // 3. Vérifier rôles spécifiques
  console.log('\n=== 3. Vérification rôles spécifiques ===');
  const adminRoleA = await prisma.role.findUnique({ where: { id: 'admin-role-a' } });
  const adminRoleB = await prisma.role.findUnique({ where: { id: 'admin-role-b' } });
  const cashierRoleA = await prisma.role.findUnique({ where: { id: 'cashier-role-a' } });

  console.log(`admin-role-a existe: ${adminRoleA ? '✅' : '❌'}`);
  console.log(`admin-role-b existe: ${adminRoleB ? '✅' : '❌'}`);
  console.log(`cashier-role-a existe: ${cashierRoleA ? '✅' : '❌'}`);

  // 4. Vérifier utilisateur réel
  console.log('\n=== 4. Utilisateur réel ===');
  const realUser = await prisma.user.findUnique({
    where: { email: 'mscheilafr@gmail.com' },
  });
  if (realUser) {
    console.log('✅ Utilisateur mscheilafr@gmail.com existe:');
    console.log(`   ID: ${realUser.id}`);
    console.log(`   Organization ID: ${realUser.organizationId}`);
    console.log(`   Name: ${realUser.name}`);
    console.log(`   isActive: ${realUser.isActive}`);
  } else {
    console.log('❌ Utilisateur mscheilafr@gmail.com NON TROUVÉ');
  }

  // 5. Vérifier organisation Fleurs du monde
  console.log('\n=== 5. Organisation Fleurs du monde ===');
  const fleursOrg = await prisma.organization.findUnique({
    where: { id: 'cmu44euda000044qrsn686prq' },
  });
  if (fleursOrg) {
    console.log('✅ Organisation Fleurs du monde existe:');
    console.log(`   ID: ${fleursOrg.id}`);
    console.log(`   Name: ${fleursOrg.name}`);
    console.log(`   Slug: ${fleursOrg.slug}`);
  } else {
    console.log('❌ Organisation Fleurs du monde NON TROUVÉE');
  }

  // 6. Vérifier rôles de l'utilisateur réel
  console.log('\n=== 6. Rôles de l\'utilisateur réel ===');
  if (realUser) {
    const userRoles = await prisma.userRole.findMany({
      where: { userId: realUser.id },
      include: { role: true },
    });
    console.log(`Nombre de rôles: ${userRoles.length}`);
    for (const ur of userRoles) {
      console.log(`   - ${ur.role.name} (id: ${ur.role.id}, isGlobal: ${ur.role.isGlobal})`);
      
      // Vérifier si ce rôle a store.create
      const rolePerms = await prisma.rolePermission.findMany({
        where: { 
          roleId: ur.role.id,
          permissionId: storeCreatePermission?.id,
        },
      });
      console.log(`     store.create: ${rolePerms.length > 0 ? '✅ YES' : '❌ NO'}`);
    }
  }

  // 7. Vérifier magasins Fleurs du monde
  console.log('\n=== 7. Magasins Fleurs du monde ===');
  const fleursStores = await prisma.store.findMany({
    where: { organizationId: 'cmu44euda000044qrsn686prq' },
  });
  console.log(`Nombre de magasins: ${fleursStores.length}`);
  if (fleursStores.length > 0) {
    for (const store of fleursStores) {
      console.log(`   - ${store.name} (code: ${store.code})`);
    }
  }

  // 8. Vérifier données de test
  console.log('\n=== 8. Données de test ===');
  const testStoreA = await prisma.store.findUnique({ where: { id: 'test-store-a' } });
  const testStoreB = await prisma.store.findUnique({ where: { id: 'test-store-b' } });
  const adminA = await prisma.user.findUnique({ where: { email: 'admin.a@omnikes.test' } });
  const cashierA = await prisma.user.findUnique({ where: { email: 'cashier.a@omnikes.test' } });
  const adminB = await prisma.user.findUnique({ where: { email: 'admin.b@omnikes.test' } });

  console.log(`test-store-a: ${testStoreA ? '✅' : '❌'}`);
  console.log(`test-store-b: ${testStoreB ? '✅' : '❌'}`);
  console.log(`admin.a@omnikes.test: ${adminA ? '✅' : '❌'}`);
  console.log(`cashier.a@omnikes.test: ${cashierA ? '✅' : '❌'}`);
  console.log(`admin.b@omnikes.test: ${adminB ? '✅' : '❌'}`);

  console.log('\n🎉 Vérification terminée!');
}

main()
  .catch((e) => {
    console.error('❌ Erreur:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
