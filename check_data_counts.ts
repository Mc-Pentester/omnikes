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
  console.log('=== DATA COUNTS ===\n');

  const [organizations, users, roles, permissions, rolePermissions, userRoles, stores, customers, proformas, proformaItems, sales, saleItems, payments, inventory, inventoryMovements] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.role.count(),
    prisma.permission.count(),
    prisma.rolePermission.count(),
    prisma.userRole.count(),
    prisma.store.count(),
    prisma.customer.count(),
    prisma.proforma.count(),
    prisma.proformaItem.count(),
    prisma.sale.count(),
    prisma.saleItem.count(),
    prisma.payment.count(),
    prisma.inventory.count(),
    prisma.inventoryMovement.count(),
  ]);

  console.log(`Organizations: ${organizations}`);
  console.log(`Users: ${users}`);
  console.log(`Roles: ${roles}`);
  console.log(`Permissions: ${permissions}`);
  console.log(`RolePermissions: ${rolePermissions}`);
  console.log(`UserRoles: ${userRoles}`);
  console.log(`Stores: ${stores}`);
  console.log(`Customers: ${customers}`);
  console.log(`Proformas: ${proformas}`);
  console.log(`ProformaItems: ${proformaItems}`);
  console.log(`Sales: ${sales}`);
  console.log(`SaleItems: ${saleItems}`);
  console.log(`Payments: ${payments}`);
  console.log(`Inventory: ${inventory}`);
  console.log(`InventoryMovements: ${inventoryMovements}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
