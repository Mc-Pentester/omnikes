import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as listPurchases, POST as createPurchase } from '../../app/api/purchases/route';
import { GET as getPurchase } from '../../app/api/purchases/[id]/route';
import { POST as cancelPurchase } from '../../app/api/purchases/[id]/cancel/route';
import { POST as orderPurchase } from '../../app/api/purchases/[id]/order/route';
import { POST as receivePurchase } from '../../app/api/purchases/[id]/receive/route';

vi.mock('../../lib/auth', () => ({
  requireCurrentOrganizationId: vi.fn(),
  requirePermission: vi.fn(),
  requireAuthenticatedUser: vi.fn(),
  requireStoreAccess: vi.fn(),
  getAuthorizedStoreIds: vi.fn(),
}));

vi.mock('../../services/purchase.service', () => ({
  purchaseService: {
    list: vi.fn(),
    create: vi.fn(),
    getById: vi.fn(),
    cancel: vi.fn(),
    order: vi.fn(),
    receive: vi.fn(),
  },
}));

import {
  requireCurrentOrganizationId,
  requirePermission,
  requireAuthenticatedUser,
  requireStoreAccess,
  getAuthorizedStoreIds,
} from '../../lib/auth';
import { purchaseService } from '../../services/purchase.service';

const mockOrg = requireCurrentOrganizationId as ReturnType<typeof vi.fn>;
const mockPermission = requirePermission as ReturnType<typeof vi.fn>;
const mockUser = requireAuthenticatedUser as ReturnType<typeof vi.fn>;
const mockStoreAccess = requireStoreAccess as ReturnType<typeof vi.fn>;
const mockAuthorizedStores = getAuthorizedStoreIds as ReturnType<typeof vi.fn>;
const mockList = purchaseService.list as ReturnType<typeof vi.fn>;
const mockCreate = purchaseService.create as ReturnType<typeof vi.fn>;
const mockGetById = purchaseService.getById as ReturnType<typeof vi.fn>;
const mockCancel = purchaseService.cancel as ReturnType<typeof vi.fn>;
const mockOrder = purchaseService.order as ReturnType<typeof vi.fn>;
const mockReceive = purchaseService.receive as ReturnType<typeof vi.fn>;

const storeA = 'cm123456789012345678901234';
const storeB = 'cm223456789012345678901234';
const purchaseId = 'cm323456789012345678901234';
const orgId = 'org-test';

const context = { params: Promise.resolve({ id: purchaseId }) };

describe('Purchase API store-scope authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrg.mockResolvedValue(orgId);
    mockPermission.mockResolvedValue(undefined);
    mockUser.mockResolvedValue({ id: 'user-a', organizationId: orgId });
    mockStoreAccess.mockResolvedValue(undefined);
    mockAuthorizedStores.mockResolvedValue([storeA]);
    mockGetById.mockResolvedValue({ id: purchaseId, storeId: storeB });
  });

  it('rejects listing a store outside the user scope before querying purchases', async () => {
    mockStoreAccess.mockRejectedValue(new Error('Not authorized to access this store'));
    const request = new NextRequest(`http://localhost/api/purchases?storeId=${storeB}`);

    const response = await listPurchases(request);

    expect(response.status).toBe(403);
    expect(mockStoreAccess).toHaveBeenCalledWith(expect.anything(), storeB);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('rejects creating a purchase for a store outside the user scope before mutation', async () => {
    mockStoreAccess.mockRejectedValue(new Error('Not authorized to access this store'));
    const request = new NextRequest('http://localhost/api/purchases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        storeId: storeB,
        supplierId: storeA,
        reference: 'PO-TEST-001',
        items: [{ variantId: purchaseId, orderedQuantity: 1, unitCost: 10 }],
      }),
    });

    const response = await createPurchase(request);

    expect(response.status).toBe(403);
    expect(mockStoreAccess).toHaveBeenCalledWith(expect.anything(), storeB);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects reading a purchase belonging to a store outside the user scope', async () => {
    mockStoreAccess.mockRejectedValue(new Error('Not authorized to access this store'));
    const response = await getPurchase(new NextRequest(`http://localhost/api/purchases/${purchaseId}`), context);

    expect(response.status).toBe(403);
    expect(mockGetById).toHaveBeenCalledWith(purchaseId, orgId);
  });

  it.each([
    ['cancel', cancelPurchase, mockCancel],
    ['order', orderPurchase, mockOrder],
    ['receive', receivePurchase, mockReceive],
  ])('rejects %s for a purchase belonging to an unauthorized store', async (_name, handler) => {
    mockStoreAccess.mockRejectedValue(new Error('Not authorized to access this store'));
    const request = new NextRequest(`http://localhost/api/purchases/${purchaseId}/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{ purchaseItemId: storeA, quantity: 1 }] }),
    });

    const response = await handler(request, context);

    expect(response.status).toBe(403);
    expect(mockStoreAccess).toHaveBeenCalledWith(expect.anything(), storeB);
    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockOrder).not.toHaveBeenCalled();
    expect(mockReceive).not.toHaveBeenCalled();
  });
});
