import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@omnikes/lib/auth', () => ({
  requireCurrentOrganizationId: vi.fn(),
  requirePermission: vi.fn(),
  requireStoreAccess: vi.fn(),
  getAuthorizedStoreIds: vi.fn(),
}));

vi.mock('@omnikes/services/sales-report.service', () => ({
  salesReportService: { getSummary: vi.fn() },
}));

vi.mock('@omnikes/lib/validation', () => ({
  salesReportSummarySchema: { parse: vi.fn((value) => value) },
}));

vi.mock('@omnikes/lib/date-validation', () => ({
  parseReportDateParam: vi.fn((value) => (value ? new Date(value) : undefined)),
}));

import {
  requireCurrentOrganizationId,
  requirePermission,
  requireStoreAccess,
  getAuthorizedStoreIds,
} from '@omnikes/lib/auth';
import { salesReportService } from '@omnikes/services/sales-report.service';
import { GET } from '@omnikes/app/api/reports/sales/summary/route';

describe('P1-G report API authorization contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getAuthorizedStoreIds as any).mockResolvedValue(null);
  });

  it('returns 401 and does not reach the report service without authentication', async () => {
    (requireCurrentOrganizationId as any).mockRejectedValue(new Error('Authentication required'));

    const response = await GET(new NextRequest('http://localhost/api/reports/sales/summary'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Authentication required' });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(salesReportService.getSummary).not.toHaveBeenCalled();
  });

  it('returns 403 and does not reach the report service without report.read', async () => {
    (requireCurrentOrganizationId as any).mockResolvedValue('org-p1g');
    (requirePermission as any).mockRejectedValue(new Error('Permission required: report.read'));

    const response = await GET(new NextRequest('http://localhost/api/reports/sales/summary'));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Permission required' });
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), 'report.read');
    expect(salesReportService.getSummary).not.toHaveBeenCalled();
  });

  it('returns 403 for an unauthorized explicit store before report aggregation', async () => {
    (requireCurrentOrganizationId as any).mockResolvedValue('org-p1g');
    (requirePermission as any).mockResolvedValue(undefined);
    (requireStoreAccess as any).mockRejectedValue(new Error('Not authorized to access this store'));

    const response = await GET(
      new NextRequest('http://localhost/api/reports/sales/summary?storeId=store-other'),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Not authorized to access this store' });
    expect(requireStoreAccess).toHaveBeenCalledWith(expect.anything(), 'store-other');
    expect(getAuthorizedStoreIds).not.toHaveBeenCalled();
    expect(salesReportService.getSummary).not.toHaveBeenCalled();
  });
});
