import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@omnikes/app/api/sales/[id]/sync/route';

vi.mock('@omnikes/lib/auth', () => ({
  requireCurrentOrganizationId: vi.fn(),
  requirePermission: vi.fn(),
  requireStoreAccess: vi.fn(),
}));
vi.mock('@omnikes/services/sale.service', () => ({
  saleService: { getById: vi.fn(), syncItems: vi.fn() },
}));

import { requireCurrentOrganizationId, requirePermission, requireStoreAccess } from '@omnikes/lib/auth';
import { saleService } from '@omnikes/services/sale.service';

const saleId = 'csale12345678901234567890';
const orgId = 'corg1234567';
const storeId = 'cstore12345678901234567890';

describe('POS draft-cart synchronization permission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireCurrentOrganizationId as any).mockResolvedValue(orgId);
    (requirePermission as any).mockResolvedValue(undefined);
    (requireStoreAccess as any).mockResolvedValue(undefined);
    (saleService.getById as any).mockResolvedValue({ id: saleId, storeId });
    (saleService.syncItems as any).mockResolvedValue({ id: saleId, total: 100 });
  });

  it('uses the narrow POS sync permission instead of broad sale.update', async () => {
    const request = new NextRequest(`http://localhost/api/sales/${saleId}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applyTax: false, discount: 0, items: [] }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: saleId }) });
    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), 'sale.pos.sync');
    expect(requirePermission).not.toHaveBeenCalledWith(expect.anything(), 'sale.update');
    expect(requireStoreAccess).toHaveBeenCalledWith(expect.anything(), storeId);
  });
});
