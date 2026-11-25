import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { inventoryReportRepository } from '@omnikes/repositories/inventory-report.repository';
import { productService } from '@omnikes/services/product.service';

const suffix = Date.now().toString(36);
const ids = {
  organization: `c${suffix}invreportorg000000`,
  store: `c${suffix}invreportstore00000`,
  product: `c${suffix}invreportproduct0000`,
  variant: `c${suffix}invreportvariant00000`,
};

describe('Inventory report cost valuation - PostgreSQL', () => {
  afterAll(async () => {
    await prisma.inventoryMovement.deleteMany({ where: { inventory: { storeId: ids.store } } });
    await prisma.inventory.deleteMany({ where: { storeId: ids.store } });
    await prisma.productVariant.deleteMany({ where: { id: ids.variant } });
    await prisma.product.deleteMany({ where: { id: ids.product } });
    await prisma.store.deleteMany({ where: { id: ids.store } });
    await prisma.organization.deleteMany({ where: { id: ids.organization } });
  });

  it('uses the product variant unit cost and multiplies it by on-hand quantity', async () => {
    await prisma.organization.create({
      data: {
        id: ids.organization,
        name: 'Inventory valuation test',
        slug: `inventory-valuation-${suffix}`,
        country: 'HT',
        currency: 'HTG',
      },
    });
    await prisma.store.create({
      data: {
        id: ids.store,
        organizationId: ids.organization,
        name: 'Inventory valuation store',
        code: `INV-${suffix}`,
      },
    });
    await prisma.product.create({
      data: { id: ids.product, organizationId: ids.organization, name: 'Valuation product' },
    });
    await prisma.productVariant.create({
      data: {
        id: ids.variant,
        productId: ids.product,
        sku: `INV-VAL-${suffix}`,
        price: 100,
        cost: 12.5,
        attributes: {},
      },
    });
    await prisma.inventory.create({
      data: { storeId: ids.store, variantId: ids.variant, quantity: 4, reservedQuantity: 1 },
    });

    await productService.update(ids.product, ids.organization, {
      variantId: ids.variant,
      price: 125,
      cost: 18.75,
    });

    const updatedVariant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: ids.variant },
    });
    expect(Number(updatedVariant.price)).toBe(125);
    expect(Number(updatedVariant.cost)).toBe(18.75);

    const report = await inventoryReportRepository.getReport(ids.organization, {
      authorizedStoreIds: [ids.store],
      page: 1,
      pageSize: 25,
    });

    expect(report.stock).toHaveLength(1);
    expect(Number(report.stock[0].unitCost)).toBe(18.75);
    expect(Number(report.stock[0].stockValue)).toBe(75);
    expect(Number(report.summary.inventoryValue)).toBe(75);
    expect(Number(report.stock[0].quantity)).toBe(4);
  });
});
