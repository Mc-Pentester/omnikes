import { salesReportRepository } from '@omnikes/repositories/sales-report.repository';

export class SalesReportService {
  /**
   * Get summary statistics for completed sales
   */
  async getSummary(organizationId: string, options: {
    startDate?: Date;
    endDate?: Date;
    storeId?: string;
    authorizedStoreIds?: string[] | null;
  } = {}) {
    return salesReportRepository.getSummary(organizationId, options);
  }

  /**
   * Get sales aggregated by period
   */
  async getSalesByPeriod(organizationId: string, options: {
    startDate?: Date;
    endDate?: Date;
    storeId?: string;
    authorizedStoreIds?: string[] | null;
    granularity: 'day' | 'week' | 'month';
  }) {
    return salesReportRepository.getSalesByPeriod(organizationId, options);
  }

  /**
   * Get sales aggregated by product
   */
  async getSalesByProduct(organizationId: string, options: {
    startDate?: Date;
    endDate?: Date;
    storeId?: string;
    authorizedStoreIds?: string[] | null;
    limit?: number;
  } = {}) {
    return salesReportRepository.getSalesByProduct(organizationId, options);
  }

  /**
   * Get sales aggregated by payment method
   */
  async getSalesByPaymentMethod(organizationId: string, options: {
    startDate?: Date;
    endDate?: Date;
    storeId?: string;
    authorizedStoreIds?: string[] | null;
  } = {}) {
    return salesReportRepository.getSalesByPaymentMethod(organizationId, options);
  }

  /**
   * Get sales aggregated by store
   */
  async getSalesByStore(organizationId: string, options: {
    startDate?: Date;
    endDate?: Date;
  } = {}, authorizedStoreIds?: string[] | null) {
    return salesReportRepository.getSalesByStore(organizationId, options, authorizedStoreIds);
  }
}

export const salesReportService = new SalesReportService();
