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
  console.log('🔍 Checking inventory status...\n');

  // Get all organizations
  const organizations = await prisma.organization.findMany();
  console.log(`Found ${organizations.length} organizations\n`);

  for (const org of organizations) {
    console.log(`=== Organization: ${org.name} (${org.id}) ===`);

    // Get stores
    const stores = await prisma.store.findMany({
      where: { organizationId: org.id },
    });
    console.log(`Stores: ${stores.length} total, ${stores.filter(s => s.isActive).length} active`);

    // Get products with variants
    const products = await prisma.product.findMany({
      where: { organizationId: org.id },
      include: { variants: true },
    });
    console.log(`Products: ${products.length} total, ${products.filter(p => p.isActive).length} active`);
    
    let totalVariants = 0;
    for (const p of products) {
      totalVariants += p.variants.length;
    }
    console.log(`Total variants: ${totalVariants}`);

    // Get inventory
    const inventory = await prisma.inventory.findMany({
      where: {
        store: { organizationId: org.id },
      },
      include: {
        store: true,
        variant: {
          include: {
            product: true,
          },
        },
      },
    });
    console.log(`Inventory entries: ${inventory.length}\n`);

    if (inventory.length > 0) {
      console.log('Sample inventory entries:');
      inventory.slice(0, 5).forEach(inv => {
        console.log(`  - ${inv.store.name} / ${inv.variant.product.name} (${inv.variant.sku}): qty=${inv.quantity}`);
      });
    }

    console.log('');
  }

  // Check for products without variants
  console.log('\n=== Products without variants ===');
  const productsWithoutVariants = await prisma.product.findMany({
    where: {
      variants: {
        none: {},
      },
    },
    include: {
      organization: true,
    },
  });

  if (productsWithoutVariants.length > 0) {
    console.log(`Found ${productsWithoutVariants.length} products without variants:`);
    productsWithoutVariants.forEach(p => {
      console.log(`  - ${p.name} (${p.organization.name})`);
    });
  } else {
    console.log('None');
  }
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
