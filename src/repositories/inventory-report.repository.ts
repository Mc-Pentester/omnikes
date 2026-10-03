import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

const MAX_REPORT_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

type InventoryReportOptions = {
  startDate?: Date;
  endDate?: Date;
  storeId?: string;
  authorizedStoreIds?: string[] | null;
  lowStockThreshold?: number;
};

function normalizeDateRange(options: InventoryReportOptions) {
  const now = new Date();
  let startDate = options.startDate;
  let endDate = options.endDate;

  if (!startDate && !endDate) {
    endDate = now;
    startDate = new Date(now.getTime() - MAX_REPORT_RANGE_MS);
  } else if (startDate && !endDate) {
    endDate = new Date(startDate.getTime() + MAX_REPORT_RANGE_MS);
  } else if (!startDate && endDate) {
    startDate = new Date(endDate.getTime() - MAX_REPORT_RANGE_MS);
  }

  if (!startDate || !endDate || startDate > endDate ||
      endDate.getTime() - startDate.getTime() > MAX_REPORT_RANGE_MS) {
    throw new Error('Report date range exceeds the maximum allowed range of 366 days');
  }

  return { startDate, endDate };
}

function buildInventoryConditions(organizationId: string, options: InventoryReportOptions): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`s."organizationId" = ${organizationId}`,
  ];

  if (options.storeId) conditions.push(Prisma.sql`i."storeId" = ${options.storeId}`);

  if (options.authorizedStoreIds != null) {
    if (options.authorizedStoreIds.length === 0) {
      conditions.push(Prisma.sql`FALSE`);
    } else {
      conditions.push(Prisma.sql`i."storeId" IN (${Prisma.join(options.authorizedStoreIds)})`);
    }
  }

  return Prisma.join(conditions, ' AND ');
}

export class InventoryReportRepository {
  async getReport(organizationId: string, options: InventoryReportOptions = {}) {
    const { startDate, endDate } = normalizeDateRange(options);
    const where = buildInventoryConditions(organizationId, options);
    const threshold = Math.max(0, Math.min(1000000, Math.trunc(options.lowStockThreshold ?? 5)));

    type SummaryRow = {
      totalItems: number;
      totalQuantity: number;
      totalReserved: number;
      totalAvailable: number;
      lowStockCount: number;
      inventoryValue: number;
    };
    type StockRow = {
      inventoryId: string;
      storeId: string;
      storeName: string;
      storeCode: string;
      productId: string;
      productName: string;
      variantId: string;
      sku: string;
      saleUnit: string;
      quantity: number;
      reservedQuantity: number;
      availableQuantity: number;
      unitCost: number;
      stockValue: number;
      lowStock: boolean;
      updatedAt: Date;
    };
    type MovementRow = {
      type: string;
      movementCount: number;
      quantity: number;
    };

    const [summaryRows, stockRows, movementRows] = await Promise.all([
      prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
        WITH filtered_inventory AS (
          SELECT i."quantity", i."reservedQuantity", pv."cost"
          FROM "inventories" i
          INNER JOIN "stores" s ON s."id" = i."storeId"
          INNER JOIN "product_variants" pv ON pv."id" = i."variantId"
          WHERE ${where}
        )
        SELECT
          COUNT(*)::int AS "totalItems",
          COALESCE(SUM("quantity"), 0)::int AS "totalQuantity",
          COALESCE(SUM("reservedQuantity"), 0)::int AS "totalReserved",
          COALESCE(SUM(GREATEST("quantity" - "reservedQuantity", 0)), 0)::int AS "totalAvailable",
          COUNT(*) FILTER (
            WHERE GREATEST("quantity" - "reservedQuantity", 0) <= ${threshold}
          )::int AS "lowStockCount",
          ROUND(COALESCE(SUM("quantity" * "cost"), 0)::numeric, 2)::double precision AS "inventoryValue"
        FROM filtered_inventory
      `),
      prisma.$queryRaw<StockRow[]>(Prisma.sql`
        SELECT
          i."id" AS "inventoryId",
          i."storeId" AS "storeId",
          s."name" AS "storeName",
          s."code" AS "storeCode",
          p."id" AS "productId",
          p."name" AS "productName",
          pv."id" AS "variantId",
          pv."sku" AS "sku",
          pv."saleUnit" AS "saleUnit",
          i."quantity" AS "quantity",
          i."reservedQuantity" AS "reservedQuantity",
          GREATEST(i."quantity" - i."reservedQuantity", 0)::int AS "availableQuantity",
          pv."cost"::double precision AS "unitCost",
          ROUND((i."quantity" * pv."cost")::numeric, 2)::double precision AS "stockValue",
          (GREATEST(i."quantity" - i."reservedQuantity", 0) <= ${threshold}) AS "lowStock",
          i."updatedAt" AS "updatedAt"
        FROM "inventories" i
        INNER JOIN "stores" s ON s."id" = i."storeId"
        INNER JOIN "product_variants" pv ON pv."id" = i."variantId"
        INNER JOIN "products" p ON p."id" = pv."productId"
        WHERE ${where}
        ORDER BY "lowStock" DESC, "availableQuantity" ASC, p."name" ASC, pv."sku" ASC
      `),
      prisma.$queryRaw<MovementRow[]>(Prisma.sql`
        SELECT
          im."type" AS "type",
          COUNT(*)::int AS "movementCount",
          COALESCE(SUM(im."quantity"), 0)::int AS "quantity"
        FROM "inventory_movements" im
        INNER JOIN "inventories" i ON i."id" = im."inventoryId"
        INNER JOIN "stores" s ON s."id" = i."storeId"
        WHERE ${where}
          AND im."createdAt" >= ${startDate}
          AND im."createdAt" <= ${endDate}
        GROUP BY im."type"
        ORDER BY "movementCount" DESC, im."type" ASC
      `),
    ]);

    return {
      startDate,
      endDate,
      lowStockThreshold: threshold,
      summary: summaryRows[0] ?? {
        totalItems: 0,
        totalQuantity: 0,
        totalReserved: 0,
        totalAvailable: 0,
        lowStockCount: 0,
        inventoryValue: 0,
      },
      stock: stockRows,
      movements: movementRows,
    };
  }
}

export const inventoryReportRepository = new InventoryReportRepository();
