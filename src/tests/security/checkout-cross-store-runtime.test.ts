import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as POSTCheckout } from '../../app/api/sales/[id]/checkout/route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('../../lib/auth', () => ({
  requireCurrentOrganizationId: vi.fn(),
  requirePermission: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  requireStoreAccess: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    checkoutIdempotency: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    sale: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { requireCurrentOrganizationId, requirePermission, getAuthenticatedUser, requireStoreAccess } from '../../lib/auth';
import { prisma } from '../../lib/prisma';

// Type assertions for mocked functions
const mockedRequireCurrentOrganizationId = requireCurrentOrganizationId as ReturnType<typeof vi.fn>;
const mockedRequirePermission = requirePermission as ReturnType<typeof vi.fn>;
const mockedGetAuthenticatedUser = getAuthenticatedUser as ReturnType<typeof vi.fn>;
const mockedRequireStoreAccess = requireStoreAccess as ReturnType<typeof vi.fn>;
const mockedPrisma = prisma as {
  checkoutIdempotency: {
    findUnique: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  sale: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

describe('P0-21-B.1 Checkout Cross-Store Runtime Tests', () => {
  const mockOrganizationId = 'org-a-id';
  const mockUserId = 'user-a-id';
  const storeA = 'store-a-id';
  const storeB = 'store-b-id';
  const saleA = 'sale-a-id';
  const saleB = 'sale-b-id';
  const idempotencyKey = 'p0-21-b1-cross-store-test-key';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TEST C1 — Authorized checkout', () => {
    it('should allow checkout when user has access to the sale\'s store', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedRequireStoreAccess.mockResolvedValue(undefined);
      mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue(null);
      mockedPrisma.sale.findFirst.mockResolvedValue({
        storeId: storeA,
        organizationId: mockOrganizationId,
      });
      mockedPrisma.$transaction.mockResolvedValue({
        id: saleA,
        status: 'COMPLETED',
      });

      const request = new NextRequest(`http://localhost/api/sales/${saleA}/checkout`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleA }) });

      expect(response.status).toBe(201);
      expect(mockedRequireStoreAccess).toHaveBeenCalledWith(expect.anything(), storeA);
      expect(mockedPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('TEST C2 — Cross-store checkout rejected', () => {
    it('should reject checkout when user does not have access to the sale\'s store', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedRequireStoreAccess.mockRejectedValue(new Error('Not authorized to access this store'));
      mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue(null);
      mockedPrisma.sale.findFirst.mockResolvedValue({
        storeId: storeB,
        organizationId: mockOrganizationId,
      });

      const request = new NextRequest(`http://localhost/api/sales/${saleB}/checkout`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleB }) });

      expect(response.status).toBe(403);
      expect(mockedRequireStoreAccess).toHaveBeenCalledWith(expect.anything(), storeB);
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('TEST C3 — Rejected checkout causes no mutation', () => {
    it('should not call transaction when store access is denied', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedRequireStoreAccess.mockRejectedValue(new Error('Not authorized to access this store'));
      mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue(null);
      mockedPrisma.sale.findFirst.mockResolvedValue({
        storeId: storeB,
        organizationId: mockOrganizationId,
      });

      const request = new NextRequest(`http://localhost/api/sales/${saleB}/checkout`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleB }) });

      expect(response.status).toBe(403);
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('TEST C4 — Cross-organization checkout rejected', () => {
    it('should reject checkout when sale belongs to different organization', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue(null);
      mockedPrisma.sale.findFirst.mockResolvedValue({
        storeId: storeB,
        organizationId: 'org-b-id', // Different organization
      });

      const request = new NextRequest(`http://localhost/api/sales/${saleB}/checkout`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleB }) });

      expect(response.status).toBe(404);
      expect(mockedRequireStoreAccess).not.toHaveBeenCalled();
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('TEST C5 — Transaction not reached after store rejection', () => {
    it('should verify transaction is not called when requireStoreAccess rejects', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedRequireStoreAccess.mockRejectedValue(new Error('Not authorized to access this store'));
      mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue(null);
      mockedPrisma.sale.findFirst.mockResolvedValue({
        storeId: storeB,
        organizationId: mockOrganizationId,
      });

      const request = new NextRequest(`http://localhost/api/sales/${saleB}/checkout`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleB }) });

      expect(response.status).toBe(403);
      expect(mockedRequireStoreAccess).toHaveBeenCalled();
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('TEST C6 — No idempotency record created after rejection', () => {
    it('should not create idempotency record when store access is denied', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedRequireStoreAccess.mockRejectedValue(new Error('Not authorized to access this store'));
      mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue(null);
      mockedPrisma.sale.findFirst.mockResolvedValue({
        storeId: storeB,
        organizationId: mockOrganizationId,
      });

      const request = new NextRequest(`http://localhost/api/sales/${saleB}/checkout`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleB }) });

      expect(response.status).toBe(403);
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
      // Idempotency record is created inside transaction, so if transaction is not called,
      // no idempotency record is created
    });
  });

  describe('TEST C7 — Repeated rejected checkout remains side-effect free', () => {
    it('should consistently reject repeated cross-store checkout attempts', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedRequireStoreAccess.mockRejectedValue(new Error('Not authorized to access this store'));
      mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue(null);
      mockedPrisma.sale.findFirst.mockResolvedValue({
        storeId: storeB,
        organizationId: mockOrganizationId,
      });

      const request1 = new NextRequest(`http://localhost/api/sales/${saleB}/checkout`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      // First request
      const response1 = await POSTCheckout(request1, { params: Promise.resolve({ id: saleB }) });
      expect(response1.status).toBe(403);
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();

      const request2 = new NextRequest(`http://localhost/api/sales/${saleB}/checkout`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      // Second request with same idempotency key
      const response2 = await POSTCheckout(request2, { params: Promise.resolve({ id: saleB }) });
      expect(response2.status).toBe(403);
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('Order of execution verification', () => {
    it('should call requireStoreAccess before transaction', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedRequireStoreAccess.mockRejectedValue(new Error('Not authorized to access this store'));
      mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue(null);
      mockedPrisma.sale.findFirst.mockResolvedValue({
        storeId: storeB,
        organizationId: mockOrganizationId,
      });

      const request = new NextRequest(`http://localhost/api/sales/${saleB}/checkout`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      await POSTCheckout(request, { params: Promise.resolve({ id: saleB }) });

      const requireStoreAccessCalls = mockedRequireStoreAccess.mock.calls.length;
      const transactionCalls = mockedPrisma.$transaction.mock.calls.length;

      expect(requireStoreAccessCalls).toBeGreaterThan(0);
      expect(transactionCalls).toBe(0);
    });
  });
});
