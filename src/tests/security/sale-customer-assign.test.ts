import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from '@omnikes/app/api/sales/[id]/customer/route';

vi.mock('@omnikes/lib/auth', () => ({
  requireCurrentOrganizationId: vi.fn(),
  requirePermission: vi.fn(),
  requireStoreAccess: vi.fn(),
  requireSubscriptionCapability: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@omnikes/services/sale.service', () => ({
  saleService: { getById: vi.fn(), update: vi.fn() },
}));

import { requireCurrentOrganizationId, requirePermission, requireStoreAccess } from '@omnikes/lib/auth';
import { saleService } from '@omnikes/services/sale.service';

const orgId = 'corg1234567';
const saleId = 'csale12345678901234567890';
const storeId = 'cstore12345678901234567890';
const customerId = 'ccustomer1234567890123456';

function makeRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/sales/${saleId}/customer`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POS customer assignment authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireCurrentOrganizationId as any).mockResolvedValue(orgId);
    (requirePermission as any).mockResolvedValue(undefined);
    (requireStoreAccess as any).mockResolvedValue(undefined);
    (saleService.getById as any).mockResolvedValue({ id: saleId, storeId });
    (saleService.update as any).mockResolvedValue({ id: saleId, customerId });
  });

  it('requires the dedicated assignment and customer-read permissions', async () => {
    await PATCH(makeRequest({ customerId }), { params: Promise.resolve({ id: saleId }) });
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), 'sale.customer.assign');
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), 'customer.read');
    expect(requireStoreAccess).toHaveBeenCalledWith(expect.anything(), storeId);
  });

  it('changes only customerId and rejects financial-field injection', async () => {
    const response = await PATCH(makeRequest({ customerId, total: 0, discount: 999 }), {
      params: Promise.resolve({ id: saleId }),
    });
    expect(response.status).toBe(400);
    expect(saleService.update).not.toHaveBeenCalled();
  });

  it('supports clearing the customer on a pending sale', async () => {
    (saleService.update as any).mockResolvedValue({ id: saleId, customerId: null });
    const response = await PATCH(makeRequest({ customerId: null }), {
      params: Promise.resolve({ id: saleId }),
    });
    expect(response.status).toBe(200);
    expect(saleService.update).toHaveBeenCalledWith(saleId, orgId, { customerId: null });
  });
});
