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
  const inventoryId = 'cmu4elkcv000cy8qrugfr7jfs';
  
  console.log(`Checking inventory: ${inventoryId}\n`);

  const inventory = await prisma.inventory.findUnique({
    where: { id: inventoryId },
    include: {
      store: {
        include: {
          organization: true,
        },
      },
      variant: {
        include: {
          product: true,
        },
      },
    },
  });

  if (!inventory) {
    console.log('Inventory not found in database');
    return;
  }

  console.log('Inventory found:');
  console.log(`  Store: ${inventory.store.name} (${inventory.store.id})`);
  console.log(`  Organization: ${inventory.store.organization.name} (${inventory.store.organization.id})`);
  console.log(`  Product: ${inventory.variant.product.name}`);
  console.log(`  Variant: ${inventory.variant.sku}`);
  console.log(`  Quantity: ${inventory.quantity}`);

  // Check movements
  const movements = await prisma.inventoryMovement.findMany({
    where: { inventoryId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  console.log(`\nMovements: ${movements.length}`);
  movements.forEach(m => {
    console.log(`  - ${m.type}: ${m.quantity} at ${m.createdAt}`);
  });
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
