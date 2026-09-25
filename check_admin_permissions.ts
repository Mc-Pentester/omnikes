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
  console.log('🔍 Diagnostic: Vérification des permissions admin.a@omnikes.test');

  // 1. Vérifier l'utilisateur
  const adminUser = await prisma.user.findUnique({
    where: { email: 'admin.a@omnikes.test' },
    include: {
      organization: true,
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!adminUser) {
    console.log('❌ Utilisateur admin.a@omnikes.test NON TROUVÉ');
    return;
  }

  console.log('✅ Utilisateur trouvé:', {
    id: adminUser.id,
    email: adminUser.email,
    name: adminUser.name,
    organization: adminUser.organization.name,
    isActive: adminUser.isActive,
  });

  // 2. Vérifier les rôles
  console.log('\n📋 Rôles assignés:');
  if (adminUser.userRoles.length === 0) {
    console.log('❌ AUCUN RÔLE ASSIGNÉ');
  } else {
    for (const userRole of adminUser.userRoles) {
      console.log(`  - ${userRole.role.name} (isGlobal: ${userRole.role.isGlobal})`);
    }
  }

  // 3. Vérifier les permissions
  console.log('\n🔑 Permissions:');
  const allPermissions = new Set<string>();
  for (const userRole of adminUser.userRoles) {
    for (const rolePermission of userRole.role.rolePermissions) {
      allPermissions.add(rolePermission.permission.code);
      console.log(`  - ${rolePermission.permission.code} (${rolePermission.permission.module})`);
    }
  }

  // 4. Vérifier product.read spécifiquement
  const hasProductRead = allPermissions.has('product.read');
  console.log('\n🎯 Vérification product.read:', hasProductRead ? '✅ PRÉSENT' : '❌ ABSENT');

  // 5. Vérifier la permission product.read dans la base
  const productReadPermission = await prisma.permission.findUnique({
    where: { code: 'product.read' },
  });

  console.log('\n📦 Permission product.read dans la base:', productReadPermission ? '✅ EXISTE' : '❌ N\'EXISTE PAS');
  if (productReadPermission) {
    console.log(`   ID: ${productReadPermission.id}`);
    console.log(`   Description: ${productReadPermission.description}`);
  }

  // 6. Vérifier le lien RolePermission
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
    console.log('\n🏢 Rôle admin-role-a trouvé');
    const hasProductReadInRole = adminRoleA.rolePermissions.some(
      rp => rp.permission.code === 'product.read'
    );
    console.log(`   product.read dans admin-role-a: ${hasProductReadInRole ? '✅ OUI' : '❌ NON'}`);
  } else {
    console.log('\n❌ Rôle admin-role-a NON TROUVÉ');
  }

  // 7. Vérifier UserRole
  const userRole = await prisma.userRole.findUnique({
    where: {
      userId_roleId: {
        userId: adminUser.id,
        roleId: 'admin-role-a',
      },
    },
  });

  console.log('\n🔗 UserRole admin.a → admin-role-a:', userRole ? '✅ EXISTE' : '❌ N\'EXISTE PAS');

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
