import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { productService } from '@omnikes/services/product.service';

describe('Product creation with opening inventory - PostgreSQL runtime', () => {
  let organizationId = '';
  let storeId = '';
  let productId = '';
  const sku = `OPENING-STOCK-${Date.now()}`;

  beforeAll(async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin.a@omnikes.test' },
      select: { organizationId: true },
    });
    organizationId = admin.organizationId;
    const store = await prisma.store.findFirstOrThrow({
      where: { organizationId, isActive: true },
      select: { id: true },
    });
    storeId = store.id;
  });

  it('creates product, inventory quantity and opening movement atomically', async () => {
    const product = await productService.create(
      organizationId,
      {
        name: `Opening stock test ${Date.now()}`,
        isActive: true,
        variants: [{ sku, price: 12, cost: 0, saleUnit: 'UNIT' }],
      },
      { storeId, quantity: 5 },
    );
    productId = product.id;
    expect(product.variants).toHaveLength(1);

    const [scopedCatalogue, noStoreAccessCatalogue, organizationCatalogue] = await Promise.all([
      productService.list(organizationId, { authorizedStoreIds: [storeId] }),
      productService.list(organizationId, { authorizedStoreIds: [] }),
      productService.list(organizationId, { authorizedStoreIds: null }),
    ]);
    const scopedVariant = scopedCatalogue.products.find((item) => item.id === product.id)?.variants[0];
    const hiddenVariant = noStoreAccessCatalogue.products.find((item) => item.id === product.id)?.variants[0];
    const organizationVariant = organizationCatalogue.products.find((item) => item.id === product.id)?.variants[0];
    expect(scopedVariant?.stock).toBe(5);
    expect(hiddenVariant?.stock).toBe(0);
    expect(organizationVariant?.stock).toBe(5);

    const [inventory, movements] = await Promise.all([
      prisma.inventory.findUniqueOrThrow({
        where: { storeId_variantId: { storeId, variantId: product.variants[0].id } },
        select: { quantity: true, reservedQuantity: true },
      }),
      prisma.inventoryMovement.findMany({
        where: { referenceId: product.id, referenceType: 'INVENTORY_INITIAL' },
        select: { type: true, quantity: true },
      }),
    ]);

    expect(inventory).toEqual({ quantity: 5, reservedQuantity: 0 });
    expect(movements).toEqual([{ type: 'PURCHASE', quantity: 5 }]);
  });

  it('rolls back product creation when the requested store is not in the organization', async () => {
    const invalidSku = `OPENING-STOCK-INVALID-${Date.now()}`;
    await expect(productService.create(
      organizationId,
      {
        name: `Invalid opening stock test ${Date.now()}`,
        isActive: true,
        variants: [{ sku: invalidSku, price: 12, cost: 0, saleUnit: 'UNIT' }],
      },
      { storeId: 'ckzzzzzzzzzzzzzzzzzzzzzz', quantity: 2 },
    )).rejects.toThrow('Initial stock store not found, inactive, or access denied');

    const persisted = await prisma.product.findFirst({ where: { organizationId, variants: { some: { sku: invalidSku } } } });
    expect(persisted).toBeNull();
  });

  afterAll(async () => {
    if (productId) {
      await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });
});
