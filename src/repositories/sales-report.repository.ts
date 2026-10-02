import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

const MAX_REPORT_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_PRODUCT_ROWS = 100;

type ReportDateOptions = {
  startDate?: Date;
  endDate?: Date;
};

type SaleFilterOptions = ReportDateOptions & {
  storeId?: string;
};

function normalizeDateRange(options: ReportDateOptions): { startDate: Date; endDate: Date } {
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

  if (!startDate || !endDate || startDate > endDate || endDate.getTime() - startDate.getTime() > MAX_REPORT_RANGE_MS) {
    throw new Error('Report date range exceeds the maximum allowed range of 366 days');
  }

  return { startDate, endDate };
}

function buildSaleConditions(
  organizationId: string,
  options: SaleFilterOptions,
): Prisma.Sql {
  const { startDate, endDate, storeId } = options;
  const conditions: Prisma.Sql[] = [
    Prisma.sql`s."organizationId" = ${organizationId}`,
    Prisma.sql`s."status" = 'COMPLETED'`,
    Prisma.sql`s."createdAt" >= ${startDate}`,
    Prisma.sql`s."createdAt" <= ${endDate}`,
  ];

  if (storeId) {
    conditions.push(Prisma.sql`s."storeId" = ${storeId}`);
  }

  return Prisma.join(conditions, Prisma.sql` AND `);
}

export class SalesReportRepository {
  /**
   * All report aggregation happens in PostgreSQL.
   * The API/service layer also applies the same 366-day ceiling.
   */
  async getSummary(organizationId: string, options: SaleFilterOptions = {}) {
    const range = normalizeDateRange(options);
    const where = buildSaleConditions(organizationId, { ...options, ...range });

    type SummaryRow = {
      salesCount: number;
      totalRevenue: number;
      totalDiscount: number;
      totalTax: number;
      itemsSold: number;
      averageSale: number;
    };

    const rows = await prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
      WITH filtered_sales AS (
        SELECT s."id", s."total", s."discount", s."tax"
        FROM "sales" s
        WHERE ${where}
      ),
      item_totals AS (
        SELECT COALESCE(SUM(si."quantity"), 0)::double precision AS "itemsSold"
        FROM "sale_items" si
        INNER JOIN filtered_sales fs ON fs."id" = si."saleId"
      )
      SELECT
        COUNT(*)::int AS "salesCount",
        COALESCE(SUM(fs."total"), 0)::double precision AS "totalRevenue",
        COALESCE(SUM(fs."discount"), 0)::double precision AS "totalDiscount",
        COALESCE(SUM(fs."tax"), 0)::double precision AS "totalTax",
        (SELECT "itemsSold" FROM item_totals) AS "itemsSold",
        CASE
          WHEN COUNT(*) = 0 THEN 0
          ELSE (SUM(fs."total") / COUNT(*))::double precision
        END AS "averageSale"
      FROM filtered_sales fs
    `);

    return rows[0] ?? {
      totalRevenue: 0,
      salesCount: 0,
      itemsSold: 0,
      totalDiscount: 0,
      totalTax: 0,
      averageSale: 0,
    };
  }

  async getSalesByPeriod(
    organizationId: string,
    options: SaleFilterOptions & { granularity: 'day' | 'week' | 'month' },
  ) {
    const range = normalizeDateRange(options);
    const where = buildSaleConditions(organizationId, { ...options, ...range });

    type PeriodRow = {
      period: string;
      salesCount: number;
      revenue: number;
      itemsSold: number;
      discount: number;
      tax: number;
    };

    const periodExpression =
      options.granularity === 'day'
        ? Prisma.sql`to_char(date_trunc('day', fs."createdAt"), 'YYYY-MM-DD')`
        : options.granularity === 'week'
          ? Prisma.sql`to_char(
              date_trunc(
                'day',
                fs."createdAt" - (extract(dow from fs."createdAt")::int * interval '1 day')
              ),
              'YYYY-MM-DD'
            )`
          : Prisma.sql`to_char(date_trunc('month', fs."createdAt"), 'YYYY-MM')`;

    const rows = await prisma.$queryRaw<PeriodRow[]>(Prisma.sql`
      WITH filtered_sales AS (
        SELECT s."id", s."createdAt", s."total", s."discount", s."tax"
        FROM "sales" s
        WHERE ${where}
      ),
      item_totals AS (
        SELECT fs."id" AS "saleId", COALESCE(SUM(si."quantity"), 0)::int AS "itemsSold"
        FROM filtered_sales fs
        LEFT JOIN "sale_items" si ON si."saleId" = fs."id"
        GROUP BY fs."id"
      )
      SELECT
        ${periodExpression} AS "period",
        COUNT(*)::int AS "salesCount",
        SUM(fs."total")::double precision AS "revenue",
        COALESCE(SUM(it."itemsSold"), 0)::int AS "itemsSold",
        SUM(fs."discount")::double precision AS "discount",
        SUM(fs."tax")::double precision AS "tax"
      FROM filtered_sales fs
      INNER JOIN item_totals it ON it."saleId" = fs."id"
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    return rows;
  }

  async getSalesByProduct(organizationId: string, options: SaleFilterOptions & { limit?: number } = {}) {
    const range = normalizeDateRange(options);
    const where = buildSaleConditions(organizationId, { ...options, ...range });
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), MAX_PRODUCT_ROWS);

    type ProductRow = {
      productId: string;
      productName: string;
      variantId: string;
      sku: string;
      quantitySold: number;
      revenue: number;
      discount: number;
      tax: number;
    };

    const rows = await prisma.$queryRaw<ProductRow[]>(Prisma.sql`
      WITH filtered_sales AS (
        SELECT s."id", s."tax"
        FROM "sales" s
        WHERE ${where}
      ),
      sale_item_totals AS (
        SELECT
          si."saleId",
          SUM(si."quantity")::double precision AS "totalQuantity"
        FROM "sale_items" si
        INNER JOIN filtered_sales fs ON fs."id" = si."saleId"
        GROUP BY si."saleId"
      )
      SELECT
        pv."productId" AS "productId",
        p."name" AS "productName",
        pv."id" AS "variantId",
        pv."sku" AS "sku",
        SUM(si."quantity")::int AS "quantitySold",
        SUM(si."totalPrice")::double precision AS "revenue",
        SUM(si."discount")::double precision AS "discount",
        COALESCE(
          SUM(
            (fs."tax" * si."quantity") / NULLIF(sit."totalQuantity", 0)
          ),
          0
        )::double precision AS "tax"
      FROM "sale_items" si
      INNER JOIN filtered_sales fs ON fs."id" = si."saleId"
      INNER JOIN sale_item_totals sit ON sit."saleId" = si."saleId"
      INNER JOIN "product_variants" pv ON pv."id" = si."variantId"
      INNER JOIN "products" p ON p."id" = pv."productId"
      GROUP BY pv."productId", p."name", pv."id", pv."sku"
      ORDER BY "revenue" DESC
      LIMIT ${limit}
    `);

    return rows;
  }

  async getSalesByPaymentMethod(organizationId: string, options: SaleFilterOptions = {}) {
    const range = normalizeDateRange(options);
    const where = buildSaleConditions(organizationId, { ...options, ...range });

    type PaymentRow = {
      paymentMethod: string;
      transactionCount: number;
      amount: number;
    };

    const rows = await prisma.$queryRaw<PaymentRow[]>(Prisma.sql`
      SELECT
        p."method" AS "paymentMethod",
        COUNT(*)::int AS "transactionCount",
        SUM(p."amount")::double precision AS "amount"
      FROM "payments" p
      INNER JOIN "sales" s ON s."id" = p."saleId"
      WHERE ${where} AND p."status" = 'COMPLETED'
      GROUP BY p."method"
      ORDER BY "amount" DESC
    `);

    return rows;
  }

  async getSalesByStore(
    organizationId: string,
    options: ReportDateOptions = {},
    authorizedStoreIds?: string[] | null,
  ) {
    if (authorizedStoreIds != null && authorizedStoreIds.length === 0) {
      return [];
    }

    const range = normalizeDateRange(options);
    const { startDate, endDate } = range;
    const conditions: Prisma.Sql[] = [
      Prisma.sql`s."organizationId" = ${organizationId}`,
      Prisma.sql`s."status" = 'COMPLETED'`,
      Prisma.sql`s."createdAt" >= ${startDate}`,
      Prisma.sql`s."createdAt" <= ${endDate}`,
    ];

    if (authorizedStoreIds != null) {
      conditions.push(Prisma.sql`s."storeId" IN (${Prisma.join(authorizedStoreIds)})`);
    }

    const where = Prisma.join(conditions, Prisma.sql` AND `);

    type StoreRow = {
      storeId: string;
      storeName: string;
      salesCount: number;
      revenue: number;
      itemsSold: number;
    };

    const rows = await prisma.$queryRaw<StoreRow[]>(Prisma.sql`
      WITH filtered_sales AS (
        SELECT s."id", s."storeId", s."total"
        FROM "sales" s
        WHERE ${where}
      ),
      item_totals AS (
        SELECT fs."id" AS "saleId", COALESCE(SUM(si."quantity"), 0)::int AS "itemsSold"
        FROM filtered_sales fs
        LEFT JOIN "sale_items" si ON si."saleId" = fs."id"
        GROUP BY fs."id"
      )
      SELECT
        fs."storeId" AS "storeId",
        st."name" AS "storeName",
        COUNT(*)::int AS "salesCount",
        SUM(fs."total")::double precision AS "revenue",
        COALESCE(SUM(it."itemsSold"), 0)::int AS "itemsSold"
      FROM filtered_sales fs
      INNER JOIN "stores" st ON st."id" = fs."storeId"
      INNER JOIN item_totals it ON it."saleId" = fs."id"
      GROUP BY fs."storeId", st."name"
      ORDER BY "revenue" DESC
    `);

    return rows;
  }
}

export const salesReportRepository = new SalesReportRepository();
