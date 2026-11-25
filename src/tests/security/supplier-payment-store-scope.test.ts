import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as listSupplierPayments, POST as createSupplierPayment } from '../../app/api/supplier-payments/route';
import { GET as getSupplierBalance } from '../../app/api/suppliers/[id]/balance/route';

vi.mock('../../lib/auth', () => ({
  requireCurrentOrganizationId: vi.fn(),
  requirePermission: vi.fn(),
  requireAuthenticatedUser: vi.fn(),
  requireStoreAccess: vi.fn(),
  getAuthorizedStoreIds: vi.fn(),
}));

vi.mock('../../services/supplier-payment.service', () => ({
  supplierPaymentService: {
    list: vi.fn(),
    create: vi.fn(),
    supplierBalance: vi.fn(),
  },
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    supplierPaymentIdempotency: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  requireCurrentOrganizationId,
  requirePermission,
  requireAuthenticatedUser,
  requireStoreAccess,
  getAuthorizedStoreIds,
} from '../../lib/auth';
import { supplierPaymentService } from '../../services/supplier-payment.service';
import { prisma } from '../../lib/prisma';

const mockOrg = requireCurrentOrganizationId as ReturnType<typeof vi.fn>;
const mockPermission = requirePermission as ReturnType<typeof vi.fn>;
const mockUser = requireAuthenticatedUser as ReturnType<typeof vi.fn>;
const mockStoreAccess = requireStoreAccess as ReturnType<typeof vi.fn>;
const mockAuthorizedStores = getAuthorizedStoreIds as ReturnType<typeof vi.fn>;
const mockList = supplierPaymentService.list as ReturnType<typeof vi.fn>;
const mockCreate = supplierPaymentService.create as ReturnType<typeof vi.fn>;
const mockBalance = supplierPaymentService.supplierBalance as ReturnType<typeof vi.fn>;
const mockFindIdempotency = prisma.supplierPaymentIdempotency.findUnique as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;

const storeA = 'cm123456789012345678901234';
const storeB = 'cm223456789012345678901234';
const supplierId = 'cm323456789012345678901234';
const orgId = 'org-test';

describe('Supplier payment API store-scope authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrg.mockResolvedValue(orgId);
    mockPermission.mockResolvedValue(undefined);
    mockUser.mockResolvedValue({ id: 'user-a', organizationId: orgId });
    mockStoreAccess.mockResolvedValue(undefined);
    mockAuthorizedStores.mockResolvedValue([storeA]);
    mockFindIdempotency.mockResolvedValue(null);
  });

  it('rejects listing supplier payments for a store outside the user scope before querying the service', async () => {
    mockStoreAccess.mockRejectedValue(new Error('Not authorized to access this store'));
    const request = new NextRequest(`http://localhost/api/supplier-payments?storeId=${storeB}`);

    const response = await listSupplierPayments(request);

    expect(response.status).toBe(403);
    expect(mockStoreAccess).toHaveBeenCalledWith(expect.anything(), storeB);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('passes the authorized store scope into supplier-payment listing', async () => {
    mockList.mockResolvedValue([]);
    const request = new NextRequest('http://localhost/api/supplier-payments');

    const response = await listSupplierPayments(request);

    expect(response.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(orgId, expect.objectContaining({ storeId: undefined }), [storeA]);
  });

  it('rejects creating a supplier payment for an unauthorized store before idempotency or payment writes', async () => {
    mockStoreAccess.mockRejectedValue(new Error('Not authorized to access this store'));
    const request = new NextRequest('http://localhost/api/supplier-payments', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': 'supplier-payment-test-001',
      },
      body: JSON.stringify({
        storeId: storeB,
        supplierId,
        amount: 25,
        method: 'BANK',
      }),
    });

    const response = await createSupplierPayment(request);

    expect(response.status).toBe(403);
    expect(mockStoreAccess).toHaveBeenCalledWith(expect.anything(), storeB);
    expect(mockFindIdempotency).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects supplier balance requests for a store outside the user scope before calculating the balance', async () => {
    mockStoreAccess.mockRejectedValue(new Error('Not authorized to access this store'));
    const request = new NextRequest(`http://localhost/api/suppliers/${supplierId}/balance?storeId=${storeB}`);
    const context = { params: Promise.resolve({ id: supplierId }) };

    const response = await getSupplierBalance(request, context);

    expect(response.status).toBe(403);
    expect(mockStoreAccess).toHaveBeenCalledWith(expect.anything(), storeB);
    expect(mockBalance).not.toHaveBeenCalled();
  });

  it('passes the authorized store scope into supplier balance calculation', async () => {
    mockBalance.mockResolvedValue({ balance: 0 });
    const request = new NextRequest(`http://localhost/api/suppliers/${supplierId}/balance`);
    const context = { params: Promise.resolve({ id: supplierId }) };

    const response = await getSupplierBalance(request, context);

    expect(response.status).toBe(200);
    expect(mockBalance).toHaveBeenCalledWith(orgId, supplierId, undefined, [storeA]);
  });
});
