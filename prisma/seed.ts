import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;
const adapter = connectionString ? new PrismaPg({ connectionString }) : undefined;

const prisma = new PrismaClient({
  adapter,
  log: ['error'],
});

async function main() {
  console.log('🌱 Starting OmniKès test data seed...');

  // ============================================================
  // SECURITY: Seed credentials must come from the environment.
  // Never embed usable passwords in source code.
  // ============================================================
  const testPasswordA = process.env.SEED_PASSWORD_A;
  const testPasswordCashierA = process.env.SEED_PASSWORD_CASHIER_A;
  const testPasswordB = process.env.SEED_PASSWORD_B;

  if (!testPasswordA || !testPasswordCashierA || !testPasswordB) {
    throw new Error(
      'SEED_PASSWORD_A, SEED_PASSWORD_CASHIER_A and SEED_PASSWORD_B are required to run the seed',
    );
  }

  const passwordHashA = await bcrypt.hash(testPasswordA, 10);
  const passwordHashCashierA = await bcrypt.hash(testPasswordCashierA, 10);
  const passwordHashB = await bcrypt.hash(testPasswordB, 10);

  // ============================================================
  // ORGANIZATIONS
  // ============================================================

  const orgA = await prisma.organization.upsert({
    where: { slug: 'omnikes-test-commerce-a' },
    update: {},
    create: {
      name: 'OmniKès Test Commerce A',
      slug: 'omnikes-test-commerce-a',
      country: 'HT',
      currency: 'HTG',
      locale: 'fr-HT',
      timezone: 'America/Port-au-Prince',
      cloudEnabled: false,
      onlineStoreEnabled: false,
    },
  });

  const orgB = await prisma.organization.upsert({
    where: { slug: 'omnikes-test-commerce-b' },
    update: {},
    create: {
      name: 'OmniKès Test Commerce B',
      slug: 'omnikes-test-commerce-b',
      country: 'HT',
      currency: 'HTG',
      locale: 'fr-HT',
      timezone: 'America/Port-au-Prince',
      cloudEnabled: false,
      onlineStoreEnabled: false,
    },
  });

  console.log('✅ Organizations created:', { orgA: orgA.id, orgB: orgB.id });

  // ============================================================
  // USERS
  // ============================================================

  const adminA = await prisma.user.upsert({
    where: { email: 'admin.a@omnikes.test' },
    update: {},
    create: {
      email: 'admin.a@omnikes.test',
      name: 'Admin Test A',
      password: passwordHashA,
      organizationId: orgA.id,
      isActive: true,
    },
  });

  const cashierA = await prisma.user.upsert({
    where: { email: 'cashier.a@omnikes.test' },
    update: {},
    create: {
      email: 'cashier.a@omnikes.test',
      name: 'Cashier Test A',
      password: passwordHashCashierA,
      organizationId: orgA.id,
      isActive: true,
    },
  });

  const adminB = await prisma.user.upsert({
    where: { email: 'admin.b@omnikes.test' },
    update: {},
    create: {
      email: 'admin.b@omnikes.test',
      name: 'Admin Test B',
      password: passwordHashB,
      organizationId: orgB.id,
      isActive: true,
    },
  });

  console.log('✅ Users created:', { adminA: adminA.id, cashierA: cashierA.id, adminB: adminB.id });

  // ============================================================
  // ROLES
  // ============================================================

  const adminRoleA = await prisma.role.upsert({
    where: { id: 'admin-role-a' },
    update: {
      organizationId: orgA.id,
      name: 'ADMIN',
      description: 'Administrator role for test organization A',
      isGlobal: true,
    },
    create: {
      id: 'admin-role-a',
      name: 'ADMIN',
      description: 'Administrator role for test organization A',
      organizationId: orgA.id,
      isGlobal: true,
    },
  });

  const cashierRoleA = await prisma.role.upsert({
    where: { id: 'cashier-role-a' },
    update: {
      organizationId: orgA.id,
      name: 'CASHIER',
      description: 'Cashier role for test organization A',
      isGlobal: true,
    },
    create: {
      id: 'cashier-role-a',
      name: 'CASHIER',
      description: 'Cashier role for test organization A',
      organizationId: orgA.id,
      isGlobal: true,
    },
  });

  const adminRoleB = await prisma.role.upsert({
    where: { id: 'admin-role-b' },
    update: {
      organizationId: orgB.id,
      name: 'ADMIN',
      description: 'Administrator role for test organization B',
      isGlobal: true,
    },
    create: {
      id: 'admin-role-b',
      name: 'ADMIN',
      description: 'Administrator role for test organization B',
      organizationId: orgB.id,
      isGlobal: true,
    },
  });

  console.log('✅ Roles created');
  const platformOperatorRole = await prisma.platformRole.upsert({
    where: { name: 'OMNIKES_PLATFORM_OPERATOR' },
    update: {
      description: 'Opérateur OmniKès autorisé à gérer les entitlements commerciaux',
      isActive: true,
    },
    create: {
      name: 'OMNIKES_PLATFORM_OPERATOR',
      description: 'Opérateur OmniKès autorisé à gérer les entitlements commerciaux',
      isActive: true,
    },
  });


  // ============================================================
  // PERMISSIONS
  // ============================================================

  const storeCreatePermission = await prisma.permission.upsert({
    where: { code: 'store.create' },
    update: {},
    create: {
      code: 'store.create',
      description: 'Créer un magasin dans l\'organisation courante',
      module: 'store',
    },
  });

  const storeReadPermission = await prisma.permission.upsert({
    where: { code: 'store.read' },
    update: {},
    create: {
      code: 'store.read',
      description: 'Lire les détails d\'un magasin',
      module: 'store',
    },
  });

  const storeUpdatePermission = await prisma.permission.upsert({
    where: { code: 'store.update' },
    update: {},
    create: {
      code: 'store.update',
      description: 'Modifier un magasin',
      module: 'store',    },
  });

  const storeActivatePermission = await prisma.permission.upsert({
    where: { code: 'store.activate' },
    update: {},
    create: {
      code: 'store.activate',
      description: 'Activer un magasin',
      module: 'store',
    },
  });

  const storeDeactivatePermission = await prisma.permission.upsert({
    where: { code: 'store.deactivate' },
    update: {},
    create: {
      code: 'store.deactivate',
      description: 'Désactiver un magasin',
      module: 'store',
    },
  });

  const storeDeletePermission = await prisma.permission.upsert({
    where: { code: 'store.delete' },
    update: {},
    create: {
      code: 'store.delete',
      description: 'Supprimer un magasin',
      module: 'store',
    },
  });

  const proformaCreatePermission = await prisma.permission.upsert({
    where: { code: 'proforma.create' },
    update: {},
    create: {
      code: 'proforma.create',
      description: 'Créer une proforma',
      module: 'proforma',
    },
  });

  const proformaReadPermission = await prisma.permission.upsert({
    where: { code: 'proforma.read' },
    update: {},
    create: {
      code: 'proforma.read',
      description: 'Lire les proformas',
      module: 'proforma',
    },
  });

  const proformaUpdatePermission = await prisma.permission.upsert({
    where: { code: 'proforma.update' },
    update: {},
    create: {
      code: 'proforma.update',
      description: 'Modifier une proforma',
      module: 'proforma',
    },
  });

  const proformaAcceptPermission = await prisma.permission.upsert({
    where: { code: 'proforma.accept' },
    update: {},
    create: {
      code: 'proforma.accept',
      description: 'Accepter une proforma',
      module: 'proforma',
    },
  });

  const proformaCancelPermission = await prisma.permission.upsert({
    where: { code: 'proforma.cancel' },
    update: {},
    create: {
      code: 'proforma.cancel',
      description: 'Annuler une proforma',
      module: 'proforma',
    },
  });

  const proformaConvertPermission = await prisma.permission.upsert({
    where: { code: 'proforma.convert' },
    update: {},
    create: {
      code: 'proforma.convert',
      description: 'Convertir une proforma en vente',
      module: 'proforma',
    },
  });

  const customerCreatePermission = await prisma.permission.upsert({
    where: { code: 'customer.create' },
    update: {},
    create: {
      code: 'customer.create',
      description: 'Créer un client',
      module: 'customer',
    },
  });

  const customerReadPermission = await prisma.permission.upsert({
    where: { code: 'customer.read' },
    update: {},
    create: {
      code: 'customer.read',
      description: 'Lire les clients',
      module: 'customer',
    },
  });

  const customerUpdatePermission = await prisma.permission.upsert({
    where: { code: 'customer.update' },
    update: {},
    create: {
      code: 'customer.update',
      description: 'Modifier un client',
      module: 'customer',
    },
  });

  const customerDeletePermission = await prisma.permission.upsert({
    where: { code: 'customer.delete' },
    update: {},
    create: {
      code: 'customer.delete',
      description: 'Supprimer un client',
      module: 'customer',
    },
  });

  // Sales permissions
  const saleCreatePermission = await prisma.permission.upsert({
    where: { code: 'sale.create' },
    update: {},
    create: {
      code: 'sale.create',
      description: 'Créer une vente',
      module: 'sales',
    },
  });

  const saleReadPermission = await prisma.permission.upsert({
    where: { code: 'sale.read' },
    update: {},
    create: {
      code: 'sale.read',
      description: 'Consulter les ventes',
      module: 'sales',    },
  });

  const saleUpdatePermission = await prisma.permission.upsert({
    where: { code: 'sale.update' },
    update: {},
    create: {
      code: 'sale.update',
      description: 'Modifier une vente',
      module: 'sales',
    },
  });

  const saleCompletePermission = await prisma.permission.upsert({
    where: { code: 'sale.complete' },
    update: {},
    create: {
      code: 'sale.complete',
      description: 'Finaliser une vente',
      module: 'sales',
    },
  });

  const saleCreditPermission = await prisma.permission.upsert({
    where: { code: 'sale.credit' },
    update: {},
    create: {
      code: 'sale.credit',
      description: 'Accorder un crédit client',
      module: 'sales',
    },
  });

  const saleCancelPermission = await prisma.permission.upsert({
    where: { code: 'sale.cancel' },
    update: {},
    create: {
      code: 'sale.cancel',
      description: 'Annuler une vente',
      module: 'sales',
    },
  });

  // Payment permissions
  const paymentCreatePermission = await prisma.permission.upsert({
    where: { code: 'payment.create' },
    update: {},
    create: {
      code: 'payment.create',      description: 'Créer un paiement',
      module: 'sales',
    },
  });

  const paymentReadPermission = await prisma.permission.upsert({
    where: { code: 'payment.read' },
    update: {},
    create: {
      code: 'payment.read',
      description: 'Consulter les paiements',
      module: 'sales',
    },
  });

  // Inventory permissions
  const inventoryReadPermission = await prisma.permission.upsert({
    where: { code: 'inventory.read' },
    update: {},
    create: {
      code: 'inventory.read',
      description: 'Consulter le stock',
      module: 'inventory',
    },
  });

  const inventoryAdjustPermission = await prisma.permission.upsert({
    where: { code: 'inventory.adjust' },
    update: {},
    create: {
      code: 'inventory.adjust',
      description: 'Effectuer un ajustement de stock',
      module: 'inventory',
    },
  });

  // Product permissions
  const productManagePermission = await prisma.permission.upsert({
    where: { code: 'product.manage' },
    update: {},
    create: {
      code: 'product.manage',
      description: 'Créer et modifier les produits',
      module: 'product',
    },
  });

  const productReadPermission = await prisma.permission.upsert({
    where: { code: 'product.read' },
    update: {},
    create: {
      code: 'product.read',
      description: 'Consulter les produits',
      module: 'product',
    },
  });

  // Report permissions
  const reportReadPermission = await prisma.permission.upsert({
    where: { code: 'report.read' },
    update: {},
    create: {
      code: 'report.read',
      description: 'Consulter les rapports',
      module: 'reports',
    },
  });


  // Organization administration permissions
  const organizationReadPermission = await prisma.permission.upsert({
    where: { code: 'organization.read' },
    update: {},
    create: {
      code: 'organization.read',
      description: 'Consulter les paramètres de l’organisation',
      module: 'organization',
    },
  });

  const platformSubscriptionManagePermission = await prisma.platformPermission.upsert({
    where: { code: 'organization.subscription.manage' },
    update: {
      description: 'Activer, renouveler ou annuler l’abonnement OmniKès pour une organisation',
      module: 'subscription',
    },
    create: {
      code: 'organization.subscription.manage',
      description: 'Activer, renouveler ou annuler l’abonnement OmniKès pour une organisation',
      module: 'subscription',
    },
  });

  const organizationUpdatePermission = await prisma.permission.upsert({
    where: { code: 'organization.update' },
    update: {},
    create: {
      code: 'organization.update',
      description: 'Modifier les paramètres de l’organisation',
      module: 'organization',
    },
  });

  // Hardware bridge permissions
  const hardwareBridgeReadPermission = await prisma.permission.upsert({
    where: { code: 'hardware.bridge.read' },
    update: {},
    create: {
      code: 'hardware.bridge.read',
      description: 'Accéder au secret d’authentification du bridge matériel',
      module: 'hardware',
    },
  });

  // Tax permissions
  const taxManagePermission = await prisma.permission.upsert({
    where: { code: 'tax.manage' },
    update: {},
    create: {
      code: 'tax.manage',
      description: 'Gérer la configuration fiscale',
      module: 'tax',
    },
  });

  const userReadPermission = await prisma.permission.upsert({
    where: { code: 'user.read' },
    update: {},
    create: {
      code: 'user.read',
      description: 'Consulter les utilisateurs',
      module: 'users',
    },
  });

  const userCreatePermission = await prisma.permission.upsert({
    where: { code: 'user.create' },
    update: {},
    create: {
      code: 'user.create',
      description: 'Créer un utilisateur',
      module: 'users',
    },
  });

  const userUpdatePermission = await prisma.permission.upsert({
    where: { code: 'user.update' },
    update: {},
    create: {
      code: 'user.update',
      description: 'Modifier un utilisateur',
      module: 'users',
    },
  });


  // Role administration permissions
  const roleReadPermission = await prisma.permission.upsert({
    where: { code: 'role.read' },
    update: {},
    create: {
      code: 'role.read',
      description: 'Consulter les rôles et permissions',
      module: 'roles',
    },
  });

  const roleCreatePermission = await prisma.permission.upsert({
    where: { code: 'role.create' },
    update: {},
    create: {
      code: 'role.create',
      description: 'Créer un rôle',
      module: 'roles',
    },
  });

  const roleUpdatePermission = await prisma.permission.upsert({
    where: { code: 'role.update' },
    update: {},
    create: {
      code: 'role.update',
      description: 'Modifier un rôle et ses permissions',
      module: 'roles',
    },
  });

  const auditReadPermission = await prisma.permission.upsert({
    where: { code: 'audit.read' },
    update: {},
    create: {
      code: 'audit.read',
      description: 'Consulter le journal d’audit',
      module: 'audit',
    },
  });

  console.log('✅ Permissions created');

  // ============================================================
  // ROLE PERMISSIONS
  // ============================================================

  // Assign all store permissions to ADMIN roles
  const storePermissions = [
    storeCreatePermission,
    storeReadPermission,
    storeUpdatePermission,
    storeActivatePermission,
    storeDeactivatePermission,
    storeDeletePermission,
  ];

  const proformaPermissions = [
    proformaCreatePermission,
    proformaReadPermission,
    proformaUpdatePermission,
    proformaAcceptPermission,
    proformaCancelPermission,
    proformaConvertPermission,
  ];

  const customerPermissions = [
    customerCreatePermission,    customerReadPermission,
    customerUpdatePermission,
    customerDeletePermission,
  ];

  const salesPermissions = [
    saleCreatePermission,
    saleReadPermission,
    saleUpdatePermission,
    saleCompletePermission,
    saleCreditPermission,
    saleCancelPermission,
    paymentCreatePermission,
    paymentReadPermission,
  ];

  const inventoryPermissions = [
    inventoryReadPermission,
    inventoryAdjustPermission,
  ];

  const productPermissions = [
    productManagePermission,
    productReadPermission,
  ];

  const reportPermissions = [
    reportReadPermission,
  ];

  const taxPermissions = [
    taxManagePermission,
  ];

  const userPermissions = [
    userReadPermission,
    userCreatePermission,
    userUpdatePermission,
  ];

  for (const permission of storePermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleA.id, permissionId: permission.id } },
      update: {},
      create: {
        roleId: adminRoleA.id,
        permissionId: permission.id,
      },
    });

    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleB.id, permissionId: permission.id } },
      update: {},
      create: {
        roleId: adminRoleB.id,
        permissionId: permission.id,
      },
    });
  }

  for (const permission of proformaPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleA.id, permissionId: permission.id } },
      update: {},
      create: {
        roleId: adminRoleA.id,
        permissionId: permission.id,
      },
    });

    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleB.id, permissionId: permission.id } },
      update: {},
      create: {
        roleId: adminRoleB.id,
        permissionId: permission.id,
      },
    });
  }

  for (const permission of customerPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleA.id, permissionId: permission.id } },
      update: {},
      create: {
        roleId: adminRoleA.id,
        permissionId: permission.id,
      },
    });

    await prisma.rolePermission.upsert({      where: { roleId_permissionId: { roleId: adminRoleB.id, permissionId: permission.id } },
      update: {},
      create: {
        roleId: adminRoleB.id,
        permissionId: permission.id,
      },
    });
  }

  for (const permission of [organizationReadPermission, organizationUpdatePermission, userReadPermission, userCreatePermission, userUpdatePermission, roleReadPermission, roleCreatePermission, roleUpdatePermission, auditReadPermission, hardwareBridgeReadPermission]) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleA.id, permissionId: permission.id } },
      update: {},
      create: { roleId: adminRoleA.id, permissionId: permission.id },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleB.id, permissionId: permission.id } },
      update: {},
      create: { roleId: adminRoleB.id, permissionId: permission.id },
    });
  }

  // Assign all sales permissions to ADMIN roles
  for (const permission of salesPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleA.id, permissionId: permission.id } },
      update: {},
      create: {
        roleId: adminRoleA.id,
        permissionId: permission.id,
      },
    });

    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleB.id, permissionId: permission.id } },
      update: {},
      create: {
        roleId: adminRoleB.id,
        permissionId: permission.id,
      },
    });
  }

  // Assign all inventory permissions to ADMIN roles
  for (const permission of inventoryPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleA.id, permissionId: permission.id } },
      update: {},
      create: {
        roleId: adminRoleA.id,
        permissionId: permission.id,
      },
    });

    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleB.id, permissionId: permission.id } },
      update: {},
      create: {
        roleId: adminRoleB.id,
        permissionId: permission.id,
      },
    });
  }

  // Assign all product permissions to ADMIN roles
  for (const permission of productPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleA.id, permissionId: permission.id } },
      update: {},
      create: {
        roleId: adminRoleA.id,
        permissionId: permission.id,
      },
    });

    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleB.id, permissionId: permission.id } },
      update: {},
      create: {
        roleId: adminRoleB.id,
        permissionId: permission.id,
      },
    });
  }

  // Assign all report permissions to ADMIN roles
  for (const permission of reportPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleA.id, permissionId: permission.id } },
      update: {},
      create: {
        roleId: adminRoleA.id,
        permissionId: permission.id,
      },
    });

    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleB.id, permissionId: permission.id } },
      update: {},
      create: {
        roleId: adminRoleB.id,
        permissionId: permission.id,
      },
    });
  }

  // Assign organization administration permissions to ADMIN roles
  for (const permission of [organizationReadPermission, organizationUpdatePermission]) {
    await prisma.rolePermission.upsert({      where: { roleId_permissionId: { roleId: adminRoleA.id, permissionId: permission.id } },
      update: {},
      create: { roleId: adminRoleA.id, permissionId: permission.id },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleB.id, permissionId: permission.id } },
      update: {},
      create: { roleId: adminRoleB.id, permissionId: permission.id },
    });
  }

  // Assign all tax permissions to ADMIN roles
  for (const permission of taxPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleA.id, permissionId: permission.id } },
      update: {},
      create: {
        roleId: adminRoleA.id,
        permissionId: permission.id,
      },
    });

    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleB.id, permissionId: permission.id } },
      update: {},
      create: {
        roleId: adminRoleB.id,
        permissionId: permission.id,
      },
    });
  }

  // Assign user administration permissions to ADMIN roles
  for (const permission of userPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleA.id, permissionId: permission.id } },
      update: {},
      create: {
        roleId: adminRoleA.id,
        permissionId: permission.id,
      },
    });

    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleB.id, permissionId: permission.id } },
      update: {},
      create: {
        roleId: adminRoleB.id,
        permissionId: permission.id,
      },
    });
  }

  // Assign limited permissions to CASHIER role
  const cashierPermissions = [
    saleCreatePermission,
    saleReadPermission,
    saleUpdatePermission,
    saleCompletePermission,
    paymentCreatePermission,
    paymentReadPermission,
    inventoryReadPermission,
    productReadPermission,
    reportReadPermission,
  ];

  for (const permission of cashierPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: cashierRoleA.id, permissionId: permission.id } },
      update: {},
      create: {
        roleId: cashierRoleA.id,
        permissionId: permission.id,
      },
    });
  }

  // Assign role administration permissions to ADMIN roles
  for (const permission of [roleReadPermission, roleCreatePermission, roleUpdatePermission]) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleA.id, permissionId: permission.id } },
      update: {},
      create: { roleId: adminRoleA.id, permissionId: permission.id },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRoleB.id, permissionId: permission.id } },
      update: {},
      create: { roleId: adminRoleB.id, permissionId: permission.id },
    });
  }

  await prisma.platformRolePermission.upsert({
    where: {
      platformRoleId_platformPermissionId: {
        platformRoleId: platformOperatorRole.id,
        platformPermissionId: platformSubscriptionManagePermission.id,
      },
    },
    update: {},
    create: {
      platformRoleId: platformOperatorRole.id,
      platformPermissionId: platformSubscriptionManagePermission.id,
    },
  });

  console.log('✅ Role permissions assigned');

  // ============================================================
  // USER ROLES
  // ============================================================

  // RBAC invariant: seeded roles are organization-scoped.
  // Remove only invalid cross-organization assignments for deterministic
  // seed roles so repeated seed runs cannot recreate tenant-crossing
  // authorization.
  await prisma.userRole.deleteMany({
    where: {
      OR: [
        {
          roleId: adminRoleA.id,
          user: { organizationId: { not: orgA.id } },
        },
        {
          roleId: cashierRoleA.id,
          user: { organizationId: { not: orgA.id } },
        },
        {
          roleId: adminRoleB.id,
          user: { organizationId: { not: orgB.id } },
        },
      ],
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminA.id, roleId: adminRoleA.id } },
    update: {},
    create: {
      userId: adminA.id,
      roleId: adminRoleA.id,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: cashierA.id, roleId: cashierRoleA.id } },
    update: {},
    create: {
      userId: cashierA.id,
      roleId: cashierRoleA.id,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminB.id, roleId: adminRoleB.id } },
    update: {},
    create: {
      userId: adminB.id,
      roleId: adminRoleB.id,
    },
  });

  console.log('✅ User roles assigned');

  // ============================================================
  // STORES
  // ============================================================

  const storeA = await prisma.store.upsert({
    where: {
      organizationId_code: {
        organizationId: orgA.id,
        code: 'STORE-A',
      },
    },
    update: {
      name: 'OmniKès Test Store A',
      address: '123 Test Street A',
      city: 'Port-au-Prince',
      country: 'HT',
      phone: '+509 1234 5678',
      email: 'store.a@omnikes.test',
      isActive: true,
    },
    create: {
      organizationId: orgA.id,
      name: 'OmniKès Test Store A',
      code: 'STORE-A',
      address: '123 Test Street A',
      city: 'Port-au-Prince',
      country: 'HT',
      phone: '+509 1234 5678',
      email: 'store.a@omnikes.test',
      isActive: true,
    },
  });

  const storeB = await prisma.store.upsert({
    where: {
      organizationId_code: {
        organizationId: orgB.id,
        code: 'STORE-B',
      },
    },
    update: {
      name: 'OmniKès Test Store B',
      address: '456 Test Street B',
      city: 'Port-au-Prince',
      country: 'HT',
      phone: '+509 8765 4321',
      email: 'store.b@omnikes.test',
      isActive: true,
    },
    create: {
      organizationId: orgB.id,      name: 'OmniKès Test Store B',
      code: 'STORE-B',
      address: '456 Test Street B',
      city: 'Port-au-Prince',
      country: 'HT',
      phone: '+509 8765 4321',
      email: 'store.b@omnikes.test',
      isActive: true,
    },
  });

  console.log('✅ Stores created:', { storeA: storeA.id, storeB: storeB.id });

  // ============================================================
  // PRODUCTS - ORGANIZATION A
  // ============================================================

  const productRiceA = await prisma.product.upsert({
    where: { id: 'product-rice-a' },
    update: {},
    create: {
      id: 'product-rice-a',
      organizationId: orgA.id,
      name: 'Produit Test A — Riz 5kg',
      description: 'Riz de qualité 5kg - Test Organization A',
      category: 'Alimentation',
      isActive: true,
    },
  });

  const variantRiceA = await prisma.productVariant.upsert({
    where: { sku: 'RICE-A-5KG' },
    update: {},
    create: {
      productId: productRiceA.id,
      sku: 'RICE-A-5KG',
      barcode: '1111111111111',
      price: 250.00,
      cost: 180.00,
      attributes: { size: '5kg' },
      isActive: true,
    },
  });
  const productOilA = await prisma.product.upsert({
    where: { id: 'product-oil-a' },
    update: {},
    create: {
      id: 'product-oil-a',
      organizationId: orgA.id,
      name: 'Produit Test A — Huile 1L',
      description: 'Huile végétale 1L - Test Organization A',
      category: 'Alimentation',
      isActive: true,
    },
  });

  const variantOilA = await prisma.productVariant.upsert({
    where: { sku: 'OIL-A-1L' },
    update: {},
    create: {
      productId: productOilA.id,
      sku: 'OIL-A-1L',
      barcode: '1111111111112',
      price: 150.00,
      cost: 100.00,
      attributes: { size: '1L' },
      isActive: true,
    },
  });

  const productSugarA = await prisma.product.upsert({
    where: { id: 'product-sugar-a' },
    update: {},
    create: {
      id: 'product-sugar-a',
      organizationId: orgA.id,
      name: 'Produit Test A — Sucre 1kg',
      description: 'Sucre blanc 1kg - Test Organization A',
      category: 'Alimentation',
      isActive: true,
    },
  });

  const variantSugarA = await prisma.productVariant.upsert({
    where: { sku: 'SUGAR-A-1KG' },
    update: {},
    create: {
      productId: productSugarA.id,
      sku: 'SUGAR-A-1KG',
      barcode: '1111111111113',
      price: 80.00,
      cost: 50.00,
      attributes: { size: '1kg' },
      isActive: true,
    },
  });

  const productWaterA = await prisma.product.upsert({
    where: { id: 'product-water-a' },
    update: {},
    create: {
      id: 'product-water-a',
      organizationId: orgA.id,
      name: 'Produit Test A — Eau 1.5L',
      description: 'Eau minérale 1.5L - Test Organization A',
      category: 'Boissons',
      isActive: true,
    },
  });

  const variantWaterA = await prisma.productVariant.upsert({
    where: { sku: 'WATER-A-1.5L' },
    update: {},
    create: {
      productId: productWaterA.id,
      sku: 'WATER-A-1.5L',
      barcode: '1111111111114',
      price: 35.00,
      cost: 20.00,
      attributes: { size: '1.5L' },
      isActive: true,
    },
  });

  const productSoapA = await prisma.product.upsert({
    where: { id: 'product-soap-a' },
    update: {},
    create: {
      id: 'product-soap-a',
      organizationId: orgA.id,
      name: 'Produit Test A — Savon',
      description: 'Savon de toilette - Test Organization A',
      category: 'Hygiène',
      isActive: true,
    },
  });

  const variantSoapA = await prisma.productVariant.upsert({
    where: { sku: 'SOAP-A' },
    update: {},
    create: {
      productId: productSoapA.id,
      sku: 'SOAP-A',
      barcode: '1111111111115',
      price: 45.00,
      cost: 25.00,
      attributes: {},
      isActive: true,
    },
  });

  console.log('✅ Products A created');

  // ============================================================
  // PRODUCTS - ORGANIZATION B
  // ============================================================

  const productRiceB = await prisma.product.upsert({
    where: { id: 'product-rice-b' },
    update: {},
    create: {
      id: 'product-rice-b',
      organizationId: orgB.id,
      name: 'Produit Test B — Riz 10kg',
      description: 'Riz de qualité 10kg - Test Organization B',
      category: 'Alimentation',
      isActive: true,
    },
  });

  const variantRiceB = await prisma.productVariant.upsert({
    where: { sku: 'RICE-B-10KG' },
    update: {},
    create: {
      productId: productRiceB.id,
      sku: 'RICE-B-10KG',
      barcode: '2222222222221',
      price: 450.00,
      cost: 350.00,
      attributes: { size: '10kg' },
      isActive: true,
    },
  });

  const productOilB = await prisma.product.upsert({
    where: { id: 'product-oil-b' },
    update: {},
    create: {
      id: 'product-oil-b',
      organizationId: orgB.id,
      name: 'Produit Test B — Huile 2L',
      description: 'Huile végétale 2L - Test Organization B',
      category: 'Alimentation',
      isActive: true,
    },
  });

  const variantOilB = await prisma.productVariant.upsert({
    where: { sku: 'OIL-B-2L' },    update: {},
    create: {
      productId: productOilB.id,
      sku: 'OIL-B-2L',
      barcode: '2222222222222',
      price: 280.00,
      cost: 190.00,
      attributes: { size: '2L' },
      isActive: true,
    },
  });

  const productCoffeeB = await prisma.product.upsert({
    where: { id: 'product-coffee-b' },
    update: {},
    create: {
      id: 'product-coffee-b',
      organizationId: orgB.id,
      name: 'Produit Test B — Café',
      description: 'Café moulu 500g - Test Organization B',
      category: 'Alimentation',
      isActive: true,
    },
  });

  const variantCoffeeB = await prisma.productVariant.upsert({
    where: { sku: 'COFFEE-B-500G' },
    update: {},
    create: {
      productId: productCoffeeB.id,
      sku: 'COFFEE-B-500G',
      barcode: '2222222222223',
      price: 350.00,
      cost: 250.00,
      attributes: { size: '500g' },
      isActive: true,
    },
  });

  const productMilkB = await prisma.product.upsert({
    where: { id: 'product-milk-b' },
    update: {},
    create: {
      id: 'product-milk-b',
      organizationId: orgB.id,
      name: 'Produit Test B — Lait',
      description: 'Lait en poudre 1kg - Test Organization B',
      category: 'Alimentation',
      isActive: true,
    },
  });

  const variantMilkB = await prisma.productVariant.upsert({
    where: { sku: 'MILK-B-1KG' },
    update: {},
    create: {
      productId: productMilkB.id,
      sku: 'MILK-B-1KG',
      barcode: '2222222222224',
      price: 420.00,
      cost: 300.00,
      attributes: { size: '1kg' },
      isActive: true,
    },
  });

  console.log('✅ Products B created');

  // ============================================================
  // INVENTORY - ORGANIZATION A
  // ============================================================

  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId: storeA.id, variantId: variantRiceA.id } },
    update: { quantity: 100 },
    create: {
      storeId: storeA.id,
      variantId: variantRiceA.id,
      quantity: 100,
      reservedQuantity: 0,
    },
  });

  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId: storeA.id, variantId: variantOilA.id } },
    update: { quantity: 80 },
    create: {
      storeId: storeA.id,
      variantId: variantOilA.id,
      quantity: 80,
      reservedQuantity: 0,
    },
  });

  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId: storeA.id, variantId: variantSugarA.id } },
    update: { quantity: 120 },
    create: {
      storeId: storeA.id,
      variantId: variantSugarA.id,
      quantity: 120,
      reservedQuantity: 0,
    },
  });

  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId: storeA.id, variantId: variantWaterA.id } },
    update: { quantity: 200 },
    create: {
      storeId: storeA.id,
      variantId: variantWaterA.id,
      quantity: 200,
      reservedQuantity: 0,
    },
  });

  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId: storeA.id, variantId: variantSoapA.id } },
    update: { quantity: 75 },
    create: {
      storeId: storeA.id,
      variantId: variantSoapA.id,
      quantity: 75,
      reservedQuantity: 0,
    },
  });

  console.log('✅ Inventory A created');

  // ============================================================
  // INVENTORY - ORGANIZATION B
  // ============================================================

  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId: storeB.id, variantId: variantRiceB.id } },
    update: { quantity: 50 },
    create: {
      storeId: storeB.id,
      variantId: variantRiceB.id,
      quantity: 50,
      reservedQuantity: 0,
    },
  });

  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId: storeB.id, variantId: variantOilB.id } },
    update: { quantity: 60 },
    create: {
      storeId: storeB.id,
      variantId: variantOilB.id,
      quantity: 60,
      reservedQuantity: 0,
    },
  });

  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId: storeB.id, variantId: variantCoffeeB.id } },
    update: { quantity: 90 },
    create: {
      storeId: storeB.id,
      variantId: variantCoffeeB.id,
      quantity: 90,
      reservedQuantity: 0,
    },
  });

  await prisma.inventory.upsert({
    where: { storeId_variantId: { storeId: storeB.id, variantId: variantMilkB.id } },
    update: { quantity: 100 },
    create: {
      storeId: storeB.id,
      variantId: variantMilkB.id,
      quantity: 100,
      reservedQuantity: 0,
    },
  });

  console.log('✅ Inventory B created');
  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
