import { inventoryReportRepository } from '@omnikes/repositories/inventory-report.repository';

export class InventoryReportService {
  async getReport(
    organizationId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      storeId?: string;
      authorizedStoreIds?: string[] | null;
      lowStockThreshold?: number;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    return inventoryReportRepository.getReport(organizationId, options);
  }
}

export const inventoryReportService = new InventoryReportService();
