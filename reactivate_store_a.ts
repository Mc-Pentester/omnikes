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
  console.log('=== P0-14-C.2.2 — RÉACTIVATION STORE-A ===\n');

  const storeId = 'c4ddt00jmalvdpx0119mbr2z0';

  // Vérifier l'état actuel
  const currentStore = await prisma.store.findUnique({
    where: { id: storeId },
  });

  if (!currentStore) {
    console.log('❌ Store NON TROUVÉ');
    process.exit(1);
  }

  console.log('État actuel STORE-A:');
  console.log(`  code: ${currentStore.code}`);
  console.log(`  name: ${currentStore.name}`);
  console.log(`  isActive: ${currentStore.isActive}`);
  console.log(`  organizationId: ${currentStore.organizationId}`);

  if (currentStore.isActive) {
    console.log('\n✅ Store est déjà actif, aucune action nécessaire');
    return;
  }

  console.log('\nRéactivation en cours...');

  // Réactiver le store
  const updatedStore = await prisma.store.update({
    where: { id: storeId },
    data: { isActive: true },
  });

  console.log('✅ Store réactivé avec succès');
  console.log(`  isActive: ${updatedStore.isActive}`);

  // Vérification
  const verifiedStore = await prisma.store.findUnique({
    where: { id: storeId },
  });

  console.log('\nÉtat après réactivation:');
  console.log(`  isActive: ${verifiedStore?.isActive}`);
}

main()
  .catch((e) => {
    console.error('Erreur:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
