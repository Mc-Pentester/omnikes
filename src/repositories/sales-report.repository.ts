import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

export class SalesReportRepository {
  /**
   * Get summary statistics for completed sales in a period
   * Only includes COMPLETED sales (excludes DRAFT, CANCELLED, etc.)
   */
  async getSummary(organizationId: string, options: {
    startDate?: Date;
    endDate?: Date;
    storeId?: string;
  } = {}) {
    const { startDate, endDate, storeId } = options;

    const where: Prisma.SaleWhereInput = {
      organizationId,
      status: 'COMPLETED',
    };

    if (storeId) {
      where.storeId = storeId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
      }
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        items: true,
      },
    });

    const salesCount = sales.length;
    const totalRevenue = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
    const totalDiscount = sales.reduce((sum, sale) => sum + Number(sale.discount), 0);
    const totalTax = sales.reduce((sum, sale) => sum + Number(sale.tax), 0);
    const itemsSold = sales.reduce((sum, sale) => 
      sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0
    );
    const averageSale = salesCount > 0 ? totalRevenue / salesCount : 0;

    return {
      totalRevenue,
      salesCount,
      itemsSold,
      totalDiscount,
      totalTax,
      averageSale,
    };
  }

  /**
   * Get sales aggregated by period (day, week, month)
   * Only includes COMPLETED sales
   */
  async getSalesByPeriod(organizationId: string, options: {
    startDate?: Date;
    endDate?: Date;
    storeId?: string;
    granularity: 'day' | 'week' | 'month';
  }) {
    const { startDate, endDate, storeId, granularity } = options;

    const where: Prisma.SaleWhereInput = {
      organizationId,
      status: 'COMPLETED',
    };

    if (storeId) {
      where.storeId = storeId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
      }
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        items: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Group by period
    const grouped = new Map<string, {
      period: string;
      salesCount: number;
      revenue: number;
      itemsSold: number;
      discount: number;
      tax: number;
    }>();

    for (const sale of sales) {
      const date = new Date(sale.createdAt);
      let periodKey: string;

      if (granularity === 'day') {
        periodKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      } else if (granularity === 'week') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        periodKey = weekStart.toISOString().split('T')[0];
      } else { // month
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }

      const existing = grouped.get(periodKey) || {
        period: periodKey,
        salesCount: 0,
        revenue: 0,
        itemsSold: 0,
        discount: 0,
        tax: 0,
      };

      existing.salesCount += 1;
      existing.revenue += Number(sale.total);
      existing.discount += Number(sale.discount);
      existing.tax += Number(sale.tax);
      existing.itemsSold += sale.items.reduce((sum, item) => sum + item.quantity, 0);

      grouped.set(periodKey, existing);
    }

    return Array.from(grouped.values()).sort((a, b) => a.period.localeCompare(b.period));
  }

  /**
   * Get sales aggregated by product
   * Only includes COMPLETED sales
   */
  async getSalesByProduct(organizationId: string, options: {
    startDate?: Date;
    endDate?: Date;
    storeId?: string;
    limit?: number;
  } = {}) {
    const { startDate, endDate, storeId, limit = 50 } = options;

    const where: Prisma.SaleWhereInput = {
      organizationId,
      status: 'COMPLETED',
    };

    if (storeId) {
      where.storeId = storeId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
      }
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });

    const grouped = new Map<string, {
      productId: string;
      productName: string;
      variantId: string;
      sku: string;
      quantitySold: number;
      revenue: number;
      discount: number;
      tax: number;
    }>();

    for (const sale of sales) {
      for (const item of sale.items) {
        const key = item.variantId;
        const existing = grouped.get(key) || {
          productId: item.variant.product.id,
          productName: item.variant.product.name,
          variantId: item.variant.id,
          sku: item.variant.sku,
          quantitySold: 0,
          revenue: 0,
          discount: 0,
          tax: 0,
        };

        existing.quantitySold += item.quantity;
        existing.revenue += Number(item.totalPrice);
        existing.discount += Number(item.discount);
        // Approximate tax per item (total tax / total items * item quantity)
        existing.tax += (Number(sale.tax) / sale.items.reduce((sum, i) => sum + i.quantity, 0)) * item.quantity;

        grouped.set(key, existing);
      }
    }

    return Array.from(grouped.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  /**
   * Get sales aggregated by payment method
   * Only includes COMPLETED sales with COMPLETED payments
   */
  async getSalesByPaymentMethod(organizationId: string, options: {
    startDate?: Date;
    endDate?: Date;
    storeId?: string;
  } = {}) {
    const { startDate, endDate, storeId } = options;

    const saleWhere: Prisma.SaleWhereInput = {
      organizationId,
      status: 'COMPLETED',
    };

    if (storeId) {
      saleWhere.storeId = storeId;
    }

    if (startDate || endDate) {
      saleWhere.createdAt = {};
      if (startDate) {
        saleWhere.createdAt.gte = startDate;
      }
      if (endDate) {
        saleWhere.createdAt.lte = endDate;
      }
    }

    const payments = await prisma.payment.findMany({
      where: {
        sale: saleWhere,
        status: 'COMPLETED',
      },
      include: {
        sale: true,
      },
    });

    const grouped = new Map<string, {
      paymentMethod: string;
      transactionCount: number;
      amount: number;
    }>();

    for (const payment of payments) {
      const key = payment.method;
      const existing = grouped.get(key) || {
        paymentMethod: key,
        transactionCount: 0,
        amount: 0,
      };

      existing.transactionCount += 1;
      existing.amount += Number(payment.amount);

      grouped.set(key, existing);
    }

    return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount);
  }

  /**
   * Get sales aggregated by store
   * Only includes COMPLETED sales
   */
  async getSalesByStore(organizationId: string, options: {
    startDate?: Date;
    endDate?: Date;
  } = {}) {
    const { startDate, endDate } = options;

    const where: Prisma.SaleWhereInput = {
      organizationId,
      status: 'COMPLETED',
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
      }
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        store: true,
        items: true,
      },
    });

    const grouped = new Map<string, {
      storeId: string;
      storeName: string;
      salesCount: number;
      revenue: number;
      itemsSold: number;
    }>();

    for (const sale of sales) {
      const key = sale.storeId;
      const existing = grouped.get(key) || {
        storeId: sale.store.id,
        storeName: sale.store.name,
        salesCount: 0,
        revenue: 0,
        itemsSold: 0,
      };

      existing.salesCount += 1;
      existing.revenue += Number(sale.total);
      existing.itemsSold += sale.items.reduce((sum, item) => sum + item.quantity, 0);

      grouped.set(key, existing);
    }

    return Array.from(grouped.values()).sort((a, b) => b.revenue - a.revenue);
  }
}

export const salesReportRepository = new SalesReportRepository();
