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
  console.log('=== VÉRIFICATION ÉTAT FINAL ===\n');

  const survivors = ['c4ddt00jmalvdpx0119mbr2z0', 'cgh7cyd6l5ltbf1gys9xshuen'];

  for (const survivorId of survivors) {
    const store = await prisma.store.findUnique({
      where: { id: survivorId },
    });

    if (store) {
      console.log(`✅ ${store.code} (${store.id}):`);
      console.log(`   isActive: ${store.isActive}`);
    } else {
      console.log(`❌ ${survivorId}: NON TROUVÉ`);
    }
  }
}

main()
  .catch((e) => {
    console.error('Erreur:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
