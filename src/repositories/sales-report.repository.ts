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
  authorizedStoreIds?: string[] | null;
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
  const { startDate, endDate, storeId, authorizedStoreIds } = options;
  const conditions: Prisma.Sql[] = [
    Prisma.sql`s."organizationId" = ${organizationId}`,
    Prisma.sql`s."status" = 'COMPLETED'`,
    Prisma.sql`s."createdAt" >= ${startDate}`,
    Prisma.sql`s."createdAt" <= ${endDate}`,
  ];

  if (storeId) {
    conditions.push(Prisma.sql`s."storeId" = ${storeId}`);
  }

  if (authorizedStoreIds != null) {
    if (authorizedStoreIds.length === 0) {
      conditions.push(Prisma.sql`FALSE`);
    } else {
      conditions.push(Prisma.sql`s."storeId" IN (${Prisma.join(authorizedStoreIds)})`);
    }
  }

  return Prisma.join(conditions, ' AND ');
}

export class SalesReportRepository {
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
      totalPaid: number;
      authorizedCredit: number;
      uncoveredAmount: number;
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
      ),
      payment_coverage AS (
        SELECT
          p."saleId",
          COALESCE(SUM(p."amount") FILTER (
            WHERE p."status" = 'COMPLETED' AND p."method" <> 'CREDIT'
          ), 0)::double precision AS "totalPaid"
        FROM "payments" p
        INNER JOIN filtered_sales fs ON fs."id" = p."saleId"
        GROUP BY p."saleId"
      ),
      credit_coverage AS (
        SELECT
          sc."saleId",
          COALESCE(SUM(sc."amount") FILTER (
            WHERE sc."status" = 'AUTHORIZED'
          ), 0)::double precision AS "authorizedCredit"
        FROM "sale_credits" sc
        INNER JOIN filtered_sales fs ON fs."id" = sc."saleId"
        GROUP BY sc."saleId"
      ),
      financial_coverage AS (
        SELECT
          ROUND(COALESCE(SUM(pc."totalPaid"), 0)::numeric, 2)::double precision AS "totalPaid",
          ROUND(COALESCE(SUM(cc."authorizedCredit"), 0)::numeric, 2)::double precision AS "authorizedCredit"
        FROM filtered_sales fs
        LEFT JOIN payment_coverage pc ON pc."saleId" = fs."id"
        LEFT JOIN credit_coverage cc ON cc."saleId" = fs."id"
      )
      SELECT
        COUNT(*)::int AS "salesCount",
        ROUND(COALESCE(SUM(fs."total"), 0)::numeric, 2)::double precision AS "totalRevenue",
        ROUND(COALESCE(SUM(fs."discount"), 0)::numeric, 2)::double precision AS "totalDiscount",
        ROUND(COALESCE(SUM(fs."tax"), 0)::numeric, 2)::double precision AS "totalTax",
        (SELECT "itemsSold" FROM item_totals) AS "itemsSold",
        (SELECT "totalPaid" FROM financial_coverage) AS "totalPaid",
        (SELECT "authorizedCredit" FROM financial_coverage) AS "authorizedCredit",
        ROUND((
          COALESCE(SUM(fs."total"), 0)
          - (SELECT "totalPaid" + "authorizedCredit" FROM financial_coverage)
        )::numeric, 2)::double precision AS "uncoveredAmount",
        CASE
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND((SUM(fs."total") / COUNT(*))::numeric, 2)::double precision
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
      totalPaid: 0,
      authorizedCredit: 0,
      uncoveredAmount: 0,
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
        ROUND(SUM(fs."total")::numeric, 2)::double precision AS "revenue",
        COALESCE(SUM(it."itemsSold"), 0)::int AS "itemsSold",
        ROUND(SUM(fs."discount")::numeric, 2)::double precision AS "discount",
        ROUND(SUM(fs."tax")::numeric, 2)::double precision AS "tax"
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
      sale_item_basis AS (
        SELECT
          si."id" AS "saleItemId",
          si."saleId",
          si."variantId",
          si."quantity",
          si."totalPrice",
          si."discount",
          fs."tax",
          SUM(si."totalPrice") OVER (PARTITION BY si."saleId") AS "saleSubtotal",
          ROW_NUMBER() OVER (PARTITION BY si."saleId" ORDER BY si."id") AS "taxAllocationOrder"
        FROM "sale_items" si
        INNER JOIN filtered_sales fs ON fs."id" = si."saleId"
      ),
      provisional_tax AS (
        SELECT
          *,
          CASE
            WHEN "saleSubtotal" = 0 THEN 0::numeric
            ELSE ROUND(("tax" * "totalPrice" / "saleSubtotal")::numeric, 2)
          END AS "provisionalTax"
        FROM sale_item_basis
      ),
      allocated_items AS (
        SELECT
          *,
          CASE
            WHEN "saleSubtotal" = 0 THEN 0::numeric
            WHEN "taxAllocationOrder" = 1 THEN
              "tax" - (
                SUM("provisionalTax") OVER (PARTITION BY "saleId") - "provisionalTax"
              )
            ELSE "provisionalTax"
          END AS "allocatedTax"
        FROM provisional_tax
      )
      SELECT
        pv."productId" AS "productId",
        p."name" AS "productName",
        pv."id" AS "variantId",
        pv."sku" AS "sku",
        SUM(ai."quantity")::int AS "quantitySold",
        ROUND(SUM(ai."totalPrice")::numeric, 2)::double precision AS "revenue",
        ROUND(SUM(ai."discount")::numeric, 2)::double precision AS "discount",
        ROUND(SUM(ai."allocatedTax")::numeric, 2)::double precision AS "tax"
      FROM allocated_items ai
      INNER JOIN "product_variants" pv ON pv."id" = ai."variantId"
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
        ROUND(SUM(p."amount")::numeric, 2)::double precision AS "amount"
      FROM "payments" p
      INNER JOIN "sales" s ON s."id" = p."saleId"
      WHERE ${where} AND p."status" = 'COMPLETED' AND p."method" <> 'CREDIT'
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

    const where = Prisma.join(conditions, ' AND ');

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
        ROUND(SUM(fs."total")::numeric, 2)::double precision AS "revenue",
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
