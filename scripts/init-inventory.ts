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
  console.log('🔧 Initializing inventory for all products and stores...');

  // Get all organizations
  const organizations = await prisma.organization.findMany();
  console.log(`Found ${organizations.length} organizations`);

  let totalCreated = 0;
  let totalExisting = 0;

  for (const org of organizations) {
    console.log(`\nProcessing organization: ${org.name}`);

    // Get all active stores for this organization
    const stores = await prisma.store.findMany({
      where: {
        organizationId: org.id,
        isActive: true,
      },
    });
    console.log(`  Found ${stores.length} active stores`);

    // Get all active products with variants for this organization
    const products = await prisma.product.findMany({
      where: {
        organizationId: org.id,
        isActive: true,
      },
      include: {
        variants: true,
      },
    });
    console.log(`  Found ${products.length} active products with variants`);

    for (const store of stores) {
      for (const product of products) {
        for (const variant of product.variants) {
          // Check if inventory already exists
          const existing = await prisma.inventory.findUnique({
            where: {
              storeId_variantId: {
                storeId: store.id,
                variantId: variant.id,
              },
            },
          });

          if (existing) {
            totalExisting++;
          } else {
            // Create inventory entry
            await prisma.inventory.create({
              data: {
                storeId: store.id,
                variantId: variant.id,
                quantity: 0,
                reservedQuantity: 0,
              },
            });
            totalCreated++;
          }
        }
      }
    }

    console.log(`  Created: ${totalCreated}, Existing: ${totalExisting}`);
  }

  console.log(`\n✅ Inventory initialization complete!`);
  console.log(`   Total created: ${totalCreated}`);
  console.log(`   Total existing: ${totalExisting}`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
