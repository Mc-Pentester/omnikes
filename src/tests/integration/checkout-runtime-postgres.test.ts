import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { POST as checkout } from '@omnikes/app/api/sales/[id]/checkout/route';

const authState = vi.hoisted(() => ({
  organizationId: '',
  userId: '',
}));

vi.mock('@omnikes/lib/auth', () => ({
  requireCurrentOrganizationId: vi.fn().mockImplementation(async () => authState.organizationId),
  requirePermission: vi.fn().mockResolvedValue(undefined),
  getAuthenticatedUser: vi.fn().mockImplementation(async () => ({ id: authState.userId })),
  requireStoreAccess: vi.fn().mockResolvedValue(undefined),
}));

describe('P0-22 — Real PostgreSQL Runtime Validation', () => {
  let orgId: string;
  let storeId: string;
  let variantId: string;
  let userId: string;
  const testPrefix = `P0_22_RUNTIME_${Date.now()}`;
  const saleIds: string[] = [];
  const inventorySnapshots = new Map<string, number>();
  let databaseConnected = false;
  let migrationStatus: string = 'UNKNOWN';

  beforeAll(async () => {
    // ÉTAPE A — PRÉCHECK
    // Vérifier DATABASE_URL sans afficher sa valeur
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.error('❌ DATABASE_URL is not set. Skipping P0-22 runtime PostgreSQL tests.');
      migrationStatus = 'SKIP: NO DATABASE_URL';
      return;
    }

    // Vérifier la connexion PostgreSQL
    try {
      await prisma.$connect();
      databaseConnected = true;
      console.log('✅ PostgreSQL connection successful');
    } catch (error) {
      console.error('❌ PostgreSQL connection failed:', error);
      migrationStatus = 'SKIP: CONNECTION FAILED';
      return;
    }

    // Vérifier que les tables nécessaires existent
    try {
      await prisma.organization.findFirst({ take: 1 });
      await prisma.store.findFirst({ take: 1 });
      await prisma.productVariant.findFirst({ take: 1 });
      await prisma.inventory.findFirst({ take: 1 });
      await prisma.sale.findFirst({ take: 1 });
      await prisma.payment.findFirst({ take: 1 });
      await prisma.inventoryMovement.findFirst({ take: 1 });
      await prisma.checkoutIdempotency.findFirst({ take: 1 });
      console.log('✅ All required tables exist');
    } catch (error) {
      console.error('❌ Required tables missing:', error);
      migrationStatus = 'SKIP: TABLES MISSING';
      return;
    }

    // Vérifier que les migrations sont à jour
    try {
      const migrations = await prisma.$queryRaw<Array<{ migration_name: string }>>`
        SELECT migration_name FROM _prisma_migrations ORDER BY migration_name DESC LIMIT 1
      `;
      if (migrations && migrations.length > 0) {
        migrationStatus = `UP TO DATE: ${migrations[0].migration_name}`;
        console.log(`✅ Migrations up to date: ${migrations[0].migration_name}`);
      } else {
        migrationStatus = 'NO MIGRATIONS';
        console.warn('⚠️ No migrations found');
      }
    } catch (error) {
      migrationStatus = 'MIGRATION CHECK FAILED';
      console.warn('⚠️ Could not check migration status:', error);
    }

    // ÉTAPE B — DONNÉES DE TEST
    // Utiliser l'organisation de test existante
    const org = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'omnikes-test-commerce-a' },
      select: { id: true },
    });
    orgId = org.id;
    authState.organizationId = orgId;

    // Utiliser un utilisateur existant
    const user = await prisma.user.findFirstOrThrow({
      where: { organizationId: orgId },
      select: { id: true },
    });
    userId = user.id;
    authState.userId = userId;

    // Utiliser le store existant
    const store = await prisma.store.findFirstOrThrow({
      where: { organizationId: orgId, code: 'STORE-A' },
      select: { id: true },
    });
    storeId = store.id;

    // Utiliser un variant existant
    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { sku: 'OIL-A-1L' },
      select: { id: true },
    });
    variantId = variant.id;

    console.log(`✅ Test environment ready - Prefix: ${testPrefix}`);
  });

  async function createSale(initialQuantity: number = 10) {
    // Capturer l'état initial du stock
    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: { storeId_variantId: { storeId, variantId } },
      select: { quantity: true },
    });

    // Créer une vente avec identifiant unique
    const sale = await prisma.sale.create({
      data: {
        organizationId: orgId,
        storeId,
        orderNumber: `${testPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        customerId: null,
        status: 'PENDING',
        subtotal: 1000,
        tax: 0,
        taxRate: 0,
        total: 1000,
        discount: 0,
        applyTax: false,
        items: {
          create: {
            variantId,
            quantity: 1,
            unitPrice: 1000,
            totalPrice: 1000,
            discount: 0,
          },
        },
      },
    });

    saleIds.push(sale.id);
    inventorySnapshots.set(sale.id, inventory.quantity);
    return sale;
  }

  async function cleanupSale(saleId: string) {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        storeId: true,
        items: { select: { quantity: true, variantId: true } },
      },
    });

    if (!sale) return;

    // Supprimer les données de test dans l'ordre inverse des dépendances
    await prisma.checkoutIdempotency.deleteMany({ where: { saleId } });
    await prisma.payment.deleteMany({ where: { saleId } });
    await prisma.inventoryMovement.deleteMany({ where: { referenceId: saleId } });
    await prisma.saleItem.deleteMany({ where: { saleId } });
    await prisma.sale.delete({ where: { id: saleId } });

    // Restaurer le stock à son état initial
    const snapshot = inventorySnapshots.get(saleId);
    if (snapshot !== undefined) {
      for (const item of sale.items) {
        await prisma.inventory.update({
          where: {
            storeId_variantId: {
              storeId: sale.storeId,
              variantId: item.variantId,
            },
          },
          data: { quantity: snapshot },
        });
      }
    }
  }

  afterAll(async () => {
    // ÉTAPE F — NETTOYAGE
    if (!databaseConnected) {
      console.log('⏭️ Skipping cleanup - database not connected');
      return;
    }

    console.log(`🧹 Cleaning up ${saleIds.length} test sales...`);
    for (const saleId of [...saleIds].reverse()) {
      try {
        await cleanupSale(saleId);
      } catch (error) {
        console.error(`❌ Failed to cleanup sale ${saleId}:`, error);
      }
    }

    await prisma.$disconnect();
    console.log('✅ Cleanup complete');
  });

  // ÉTAPE C — TEST IDEMPOTENCE RÉELLE
  it('real idempotence: second request with same key returns cached result without creating duplicate mutations', async () => {
    if (!databaseConnected) {
      console.warn('⏭️ Skipping test - database not connected');
      return;
    }

    const sale = await createSale();
    const idempotencyKey = `${testPrefix}-idempotency-${sale.id}`;

    const makeRequest = () =>
      new NextRequest(`http://localhost/api/sales/${sale.id}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          method: 'CARD',
          amount: 1000,
        }),
      });

    // Première requête
    const response1 = await checkout(makeRequest(), {
      params: Promise.resolve({ id: sale.id }),
    });

    expect(response1.status).toBe(201);

    // Deuxième requête avec la même clé
    const response2 = await checkout(makeRequest(), {
      params: Promise.resolve({ id: sale.id }),
    });

    expect(response2.status).toBe(201);

    // Vérifier en base
    const finalSale = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { payments: true },
    });

    const paymentCount = await prisma.payment.count({ where: { saleId: sale.id } });
    const movementCount = await prisma.inventoryMovement.count({
      where: { referenceId: sale.id, type: 'SALE' },
    });
    const idempotencyRecords = await prisma.checkoutIdempotency.findMany({
      where: { saleId: sale.id },
    });

    // Invariants
    expect(finalSale.status).toBe('COMPLETED');
    expect(paymentCount).toBe(1); // Un seul paiement
    expect(movementCount).toBe(1); // Un seul mouvement
    const saleMovement = await prisma.inventoryMovement.findFirstOrThrow({
      where: { referenceId: sale.id, type: 'SALE' },
      select: { quantity: true },
    });
    expect(saleMovement.quantity).toBe(1); // Les sorties sont stockées comme magnitudes positives
    expect(idempotencyRecords).toHaveLength(1); // Un seul record idempotency
    expect(idempotencyRecords[0].status).toBe('COMPLETED');
    expect(idempotencyRecords[0].key).toBe(idempotencyKey);

    console.log('✅ Real idempotence test passed');
  });

  // ÉTAPE D — CONCURRENCE RÉELLE
  it('real concurrency: two concurrent checkouts with same sale - only one succeeds', async () => {
    if (!databaseConnected) {
      console.warn('⏭️ Skipping test - database not connected');
      return;
    }

    const sale = await createSale();

    const makeRequest = (key: string) =>
      new NextRequest(`http://localhost/api/sales/${sale.id}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({
          method: 'CARD',
          amount: 1000,
        }),
      });

    // Deux requêtes concurrentes avec des clés différentes
    const [responseA, responseB] = await Promise.all([
      checkout(makeRequest(`${testPrefix}-concurrent-a-${sale.id}`), {
        params: Promise.resolve({ id: sale.id }),
      }),
      checkout(makeRequest(`${testPrefix}-concurrent-b-${sale.id}`), {
        params: Promise.resolve({ id: sale.id }),
      }),
    ]);

    const statuses = [responseA.status, responseB.status].sort();
    expect(statuses).toEqual([201, 409]); // Un succès, un conflit

    // Vérifier en base
    const finalSale = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { payments: true },
    });

    const paymentCount = await prisma.payment.count({ where: { saleId: sale.id } });
    const movementCount = await prisma.inventoryMovement.count({
      where: { referenceId: sale.id, type: 'SALE' },
    });
    const idempotencyRecords = await prisma.checkoutIdempotency.findMany({
      where: { saleId: sale.id },
    });

    // Invariants
    expect(finalSale.status).toBe('COMPLETED');
    expect(paymentCount).toBe(1); // Un seul paiement
    expect(movementCount).toBe(1); // Un seul mouvement
    expect(idempotencyRecords).toHaveLength(1); // Un seul record idempotency

    console.log('✅ Real concurrency test passed');
  });

  it('real concurrency: two concurrent requests with same idempotency key - returns committed response', async () => {
    if (!databaseConnected) {
      console.warn('⏭️ Skipping test - database not connected');
      return;
    }

    const sale = await createSale();
    const idempotencyKey = `${testPrefix}-same-key-${sale.id}`;

    const makeRequest = () =>
      new NextRequest(`http://localhost/api/sales/${sale.id}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          method: 'CARD',
          amount: 1000,
        }),
      });

    // Deux requêtes concurrentes avec la même clé
    const [responseA, responseB] = await Promise.all([
      checkout(makeRequest(), {
        params: Promise.resolve({ id: sale.id }),
      }),
      checkout(makeRequest(), {
        params: Promise.resolve({ id: sale.id }),
      }),
    ]);

    // Les deux devraient réussir (la deuxième reçoit le cache)
    expect(responseA.status).toBe(201);
    expect(responseB.status).toBe(201);

    // Vérifier en base
    const paymentCount = await prisma.payment.count({ where: { saleId: sale.id } });
    const movementCount = await prisma.inventoryMovement.count({
      where: { referenceId: sale.id, type: 'SALE' },
    });
    const idempotencyRecords = await prisma.checkoutIdempotency.findMany({
      where: { saleId: sale.id },
    });

    // Invariants
    expect(paymentCount).toBe(1); // Un seul paiement
    expect(movementCount).toBe(1); // Un seul mouvement
    expect(idempotencyRecords).toHaveLength(1); // Un seul record idempotency

    console.log('✅ Real concurrency (same key) test passed');
  });

  // ÉTAPE E — ATOMICITÉ / ROLLBACK RÉEL
  it('real atomicity: insufficient stock causes complete rollback without partial mutations', async () => {
    if (!databaseConnected) {
      console.warn('⏭️ Skipping test - database not connected');
      return;
    }

    // Réduire le stock à 0 pour provoquer un échec
    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: { storeId_variantId: { storeId, variantId } },
      select: { quantity: true },
    });

    const originalQuantity = inventory.quantity;
    await prisma.inventory.update({
      where: { storeId_variantId: { storeId, variantId } },
      data: { quantity: 0 },
    });

    const sale = await createSale();

    const response = await checkout(
      new NextRequest(`http://localhost/api/sales/${sale.id}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `${testPrefix}-atomicity-${sale.id}`,
        },
        body: JSON.stringify({
          method: 'CARD',
          amount: 1000,
        }),
      }),
      { params: Promise.resolve({ id: sale.id }) }
    );

    // La requête doit échouer
    expect(response.status).toBe(409);

    // Vérifier qu'aucune mutation partielle n'a persisté
    const finalSale = await prisma.sale.findUnique({
      where: { id: sale.id },
      select: { status: true },
    });

    const paymentCount = await prisma.payment.count({ where: { saleId: sale.id } });
    const movementCount = await prisma.inventoryMovement.count({
      where: { referenceId: sale.id, type: 'SALE' },
    });
    const idempotencyRecords = await prisma.checkoutIdempotency.findMany({
      where: { saleId: sale.id },
    });

    // Invariants
    expect(finalSale?.status).toBe('PENDING'); // Toujours PENDING
    expect(paymentCount).toBe(0); // Aucun paiement
    expect(movementCount).toBe(0); // Aucun mouvement
    expect(idempotencyRecords).toHaveLength(0); // Aucun record idempotency (PROCESSING roll back)

    // Restaurer le stock
    await prisma.inventory.update({
      where: { storeId_variantId: { storeId, variantId } },
      data: { quantity: originalQuantity },
    });

    console.log('✅ Real atomicity/rollback test passed');
  });

  it('real atomicity: sale already completed - second checkout rejected without mutations', async () => {
    if (!databaseConnected) {
      console.warn('⏭️ Skipping test - database not connected');
      return;
    }

    const sale = await createSale();

    // Premier checkout réussi
    const response1 = await checkout(
      new NextRequest(`http://localhost/api/sales/${sale.id}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `${testPrefix}-double-checkout-1-${sale.id}`,
        },
        body: JSON.stringify({
          method: 'CARD',
          amount: 1000,
        }),
      }),
      { params: Promise.resolve({ id: sale.id }) }
    );

    expect(response1.status).toBe(201);

    // Deuxième checkout avec une clé différente
    const response2 = await checkout(
      new NextRequest(`http://localhost/api/sales/${sale.id}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `${testPrefix}-double-checkout-2-${sale.id}`,
        },
        body: JSON.stringify({
          method: 'CARD',
          amount: 1000,
        }),
      }),
      { params: Promise.resolve({ id: sale.id }) }
    );

    expect(response2.status).toBe(409);

    // Vérifier qu'il n'y a toujours qu'un seul paiement
    const paymentCount = await prisma.payment.count({ where: { saleId: sale.id } });
    const movementCount = await prisma.inventoryMovement.count({
      where: { referenceId: sale.id, type: 'SALE' },
    });

    expect(paymentCount).toBe(1); // Toujours un seul paiement
    expect(movementCount).toBe(1); // Toujours un seul mouvement

    console.log('✅ Real atomicity (double checkout) test passed');
  });
});
