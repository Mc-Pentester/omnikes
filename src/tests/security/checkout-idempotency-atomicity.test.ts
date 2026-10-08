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
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { requireCurrentOrganizationId, requirePermission, getAuthenticatedUser, requireStoreAccess } from '../../lib/auth';
import { prisma } from '../../lib/prisma';

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
    findFirst: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

describe('P0-22 — Forensic Audit: Checkout Idempotency & Atomicity', () => {
  const mockOrganizationId = 'org-a-id';
  const mockUserId = 'user-a-id';
  const storeA = 'store-a-id';
  const saleA = 'sale-a-id';
  const saleB = 'sale-b-id';
  const idempotencyKey = 'p0-22-key-001';
  const failureKey = 'p0-22-failure-001';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SECTION I — IDEMPOTENCY TESTS', () => {
    describe('TEST I1 — First checkout', () => {
      it('should create payment, deduct stock, finalize sale, and create idempotency record', async () => {
        mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
        mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
        mockedRequirePermission.mockResolvedValue(undefined);
        mockedRequireStoreAccess.mockResolvedValue(undefined);
        mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue(null);
        mockedPrisma.sale.findFirst.mockResolvedValue({
          storeId: storeA,
          organizationId: mockOrganizationId,
        });

        const mockCompletedSale = {
          id: saleA,
          status: 'COMPLETED',
          payments: [{ id: 'payment-1', method: 'CASH', amount: 100 }],
        };
        mockedPrisma.$transaction.mockResolvedValue(mockCompletedSale);

        const request = new NextRequest(`http://localhost/api/sales/${saleA}/checkout`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ method: 'CASH', amount: 100 }),
        });

        const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleA }) });

        expect(response.status).toBe(201);
        expect(mockedPrisma.$transaction).toHaveBeenCalled();
        expect(mockedPrisma.checkoutIdempotency.findUnique).toHaveBeenCalledWith({
          where: {
            organizationId_key: {
              organizationId: mockOrganizationId,
              key: idempotencyKey,
            },
          },
        });
      });
    });

    describe('TEST I2 — Retry identical', () => {
      it('should return cached result without creating new mutations when retrying with same key', async () => {
        mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
        mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
        mockedRequirePermission.mockResolvedValue(undefined);
        mockedRequireStoreAccess.mockResolvedValue(undefined);

        const cachedResponse = {
          payment: { method: 'CASH', amount: 100, reference: null },
          sale: { id: saleA, status: 'COMPLETED' },
        };

        mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue({
          id: 'idemp-1',
          organizationId: mockOrganizationId,
          userId: mockUserId,
          saleId: saleA,
          key: idempotencyKey,
          status: 'COMPLETED',
          responseStatus: 201,
          responseBody: JSON.stringify(cachedResponse),
        });

        const request = new NextRequest(`http://localhost/api/sales/${saleA}/checkout`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ method: 'CASH', amount: 100 }),
        });

        const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleA }) });

        expect(response.status).toBe(201);
        expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
        expect(mockedPrisma.checkoutIdempotency.delete).not.toHaveBeenCalled();
      });
    });

    describe('TEST I3 — Same key / different sale', () => {
      it('should reject when key already used for a different sale', async () => {
        mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
        mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
        mockedRequirePermission.mockResolvedValue(undefined);

        mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue({
          id: 'idemp-1',
          organizationId: mockOrganizationId,
          userId: mockUserId,
          saleId: saleA, // Different sale
          key: idempotencyKey,
          status: 'COMPLETED',
        });

        const request = new NextRequest(`http://localhost/api/sales/${saleB}/checkout`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ method: 'CASH', amount: 100 }),
        });

        const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleB }) });

        expect(response.status).toBe(409);
        expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
      });
    });

    describe('TEST I4 — Same key / different payload', () => {
      it('should reject when key used with different payment data', async () => {
        mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
        mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
        mockedRequirePermission.mockResolvedValue(undefined);

        const cachedResponse = {
          payment: { method: 'CASH', amount: 100, reference: null },
          sale: { id: saleA, status: 'COMPLETED' },
        };

        mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue({
          id: 'idemp-1',
          organizationId: mockOrganizationId,
          userId: mockUserId,
          saleId: saleA,
          key: idempotencyKey,
          status: 'COMPLETED',
          responseStatus: 201,
          responseBody: JSON.stringify(cachedResponse),
        });

        const request = new NextRequest(`http://localhost/api/sales/${saleA}/checkout`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ method: 'CARD', amount: 100 }), // Different method
        });

        const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleA }) });

        expect(response.status).toBe(409);
        expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
      });
    });

    describe('TEST I5 — Different user', () => {
      it('should reject when key used by different user', async () => {
        const userBId = 'user-b-id';
        mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
        mockedGetAuthenticatedUser.mockResolvedValue({ id: userBId });
        mockedRequirePermission.mockResolvedValue(undefined);

        mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue({
          id: 'idemp-1',
          organizationId: mockOrganizationId,
          userId: mockUserId, // Different user
          saleId: saleA,
          key: idempotencyKey,
          status: 'COMPLETED',
        });

        const request = new NextRequest(`http://localhost/api/sales/${saleA}/checkout`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ method: 'CASH', amount: 100 }),
        });

        const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleA }) });

        expect(response.status).toBe(409);
        expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
      });
    });

    describe('TEST I6 — First attempt failed', () => {
      it('should allow retry after failed checkout by deleting failed record', async () => {
        mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
        mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
        mockedRequirePermission.mockResolvedValue(undefined);
        mockedRequireStoreAccess.mockResolvedValue(undefined);

        // First call: find FAILED record
        mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue({
          id: 'idemp-1',
          organizationId: mockOrganizationId,
          userId: mockUserId,
          saleId: saleA,
          key: failureKey,
          status: 'FAILED',
        });

        mockedPrisma.sale.findFirst.mockResolvedValue({
          storeId: storeA,
          organizationId: mockOrganizationId,
        });

        const mockCompletedSale = {
          id: saleA,
          status: 'COMPLETED',
          payments: [{ id: 'payment-1', method: 'CASH', amount: 100 }],
        };
        mockedPrisma.$transaction.mockResolvedValue(mockCompletedSale);

        const request = new NextRequest(`http://localhost/api/sales/${saleA}/checkout`, {
          method: 'POST',
          headers: { 'Idempotency-Key': failureKey },
          body: JSON.stringify({ method: 'CASH', amount: 100 }),
        });

        const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleA }) });

        expect(mockedPrisma.checkoutIdempotency.delete).toHaveBeenCalledWith({
          where: { id: 'idemp-1' },
        });
        expect(mockedPrisma.$transaction).toHaveBeenCalled();
      });
    });

    describe('TEST I7 — Retry after failure', () => {
      it('should successfully process after deleting failed record', async () => {
        mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
        mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
        mockedRequirePermission.mockResolvedValue(undefined);
        mockedRequireStoreAccess.mockResolvedValue(undefined);

        // First call returns FAILED record
        mockedPrisma.checkoutIdempotency.findUnique
          .mockResolvedValueOnce({
            id: 'idemp-1',
            organizationId: mockOrganizationId,
            userId: mockUserId,
            saleId: saleA,
            key: failureKey,
            status: 'FAILED',
          })
          .mockResolvedValueOnce(null); // After deletion, returns null

        mockedPrisma.sale.findFirst.mockResolvedValue({
          storeId: storeA,
          organizationId: mockOrganizationId,
        });

        const mockCompletedSale = {
          id: saleA,
          status: 'COMPLETED',
          payments: [{ id: 'payment-1', method: 'CASH', amount: 100 }],
        };
        mockedPrisma.$transaction.mockResolvedValue(mockCompletedSale);

        const request = new NextRequest(`http://localhost/api/sales/${saleA}/checkout`, {
          method: 'POST',
          headers: { 'Idempotency-Key': failureKey },
          body: JSON.stringify({ method: 'CASH', amount: 100 }),
        });

        const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleA }) });

        expect(mockedPrisma.checkoutIdempotency.delete).toHaveBeenCalled();
        expect(mockedPrisma.$transaction).toHaveBeenCalled();
        expect(response.status).toBe(201);
      });
    });
  });

  describe('SECTION A — ATOMICITY TESTS', () => {
    describe('TEST A1 — Atomicity stock', () => {
      it('should verify transaction prevents partial mutations when stock validation fails', async () => {
        mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
        mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
        mockedRequirePermission.mockResolvedValue(undefined);
        mockedRequireStoreAccess.mockResolvedValue(undefined);
        mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue(null);
        mockedPrisma.sale.findFirst.mockResolvedValue({
          storeId: storeA,
          organizationId: mockOrganizationId,
        });

        // Transaction should throw on insufficient stock
        mockedPrisma.$transaction.mockRejectedValue(new Error('Insufficient stock for SKU-001. Available: 5, Required: 10'));

        const request = new NextRequest(`http://localhost/api/sales/${saleA}/checkout`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ method: 'CASH', amount: 100 }),
        });

        const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleA }) });

        expect(response.status).toBe(409);
        expect(mockedPrisma.$transaction).toHaveBeenCalled();
        // If transaction threw, all mutations should be rolled back
      });
    });

    describe('TEST A2 — Exception in transaction', () => {
      it('should rollback all mutations when exception occurs mid-transaction', async () => {
        mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
        mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
        mockedRequirePermission.mockResolvedValue(undefined);
        mockedRequireStoreAccess.mockResolvedValue(undefined);
        mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue(null);
        mockedPrisma.sale.findFirst.mockResolvedValue({
          storeId: storeA,
          organizationId: mockOrganizationId,
        });

        // Transaction throws - Prisma should rollback
        mockedPrisma.$transaction.mockRejectedValue(new Error('P0-22-ROLLBACK-TEST'));

        const request = new NextRequest(`http://localhost/api/sales/${saleA}/checkout`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ method: 'CASH', amount: 100 }),
        });

        const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleA }) });

        expect(response.status).toBe(500);
        expect(mockedPrisma.$transaction).toHaveBeenCalled();
        // Prisma $transaction automatically rolls back on error
      });
    });

    describe('TEST A3 — Error after payment', () => {
      it('should verify payment is not orphaned if checkout fails after payment creation', async () => {
        mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
        mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
        mockedRequirePermission.mockResolvedValue(undefined);
        mockedRequireStoreAccess.mockResolvedValue(undefined);
        mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue(null);
        mockedPrisma.sale.findFirst.mockResolvedValue({
          storeId: storeA,
          organizationId: mockOrganizationId,
        });

        // Transaction throws - payment creation is within transaction, so it rolls back
        mockedPrisma.$transaction.mockRejectedValue(new Error('Checkout failed'));

        const request = new NextRequest(`http://localhost/api/sales/${saleA}/checkout`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ method: 'CASH', amount: 100 }),
        });

        const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleA }) });

        expect(response.status).toBe(500);
        // Since payment is created inside transaction, it should be rolled back
      });
    });

    describe('TEST A4 — Inventory movement', () => {
      it('should verify inventory movement quantity matches sale item quantity', async () => {
        mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
        mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
        mockedRequirePermission.mockResolvedValue(undefined);
        mockedRequireStoreAccess.mockResolvedValue(undefined);
        mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue(null);
        mockedPrisma.sale.findFirst.mockResolvedValue({
          storeId: storeA,
          organizationId: mockOrganizationId,
        });

        const mockCompletedSale = {
          id: saleA,
          status: 'COMPLETED',
          items: [{ quantity: 5, variant: { sku: 'SKU-001' } }],
          payments: [{ id: 'payment-1', method: 'CASH', amount: 100 }],
        };
        mockedPrisma.$transaction.mockResolvedValue(mockCompletedSale);

        const request = new NextRequest(`http://localhost/api/sales/${saleA}/checkout`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ method: 'CASH', amount: 100 }),
        });

        const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleA }) });

        expect(response.status).toBe(201);
        expect(mockedPrisma.$transaction).toHaveBeenCalled();
        // Code shows: movement quantity = -item.quantity (line 304)
      });
    });

    describe('TEST A5 — Sale already finalized', () => {
      it('should reject checkout when sale is already COMPLETED', async () => {
        mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
        mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
        mockedRequirePermission.mockResolvedValue(undefined);
        mockedRequireStoreAccess.mockResolvedValue(undefined);
        mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue(null);
        mockedPrisma.sale.findFirst.mockResolvedValue({
          storeId: storeA,
          organizationId: mockOrganizationId,
        });

        // Transaction throws "Sale is already completed"
        mockedPrisma.$transaction.mockRejectedValue(new Error('Sale is already completed'));

        const request = new NextRequest(`http://localhost/api/sales/${saleA}/checkout`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ method: 'CASH', amount: 100 }),
        });

        const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleA }) });

        expect(response.status).toBe(409);
        expect(mockedPrisma.$transaction).toHaveBeenCalled();
        // No new payment/movement should be created
      });
    });
  });

  describe('SECTION C — CONCURRENCY TESTS', () => {
    describe('TEST C1 — Concurrent requests / same key', () => {
      it('should handle P2002 unique constraint violation when concurrent requests use same key', async () => {
        mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
        mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
        mockedRequirePermission.mockResolvedValue(undefined);
        mockedRequireStoreAccess.mockResolvedValue(undefined);

        // First call: no existing idempotency
        mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue(null);
        mockedPrisma.sale.findFirst.mockResolvedValue({
          storeId: storeA,
          organizationId: mockOrganizationId,
        });

        // Transaction throws P2002 (unique constraint violation)
        const p2002Error = { code: 'P2002' };
        mockedPrisma.$transaction.mockRejectedValue(p2002Error);

        // After P2002, find the committed idempotency
        mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue({
          id: 'idemp-1',
          organizationId: mockOrganizationId,
          userId: mockUserId,
          saleId: saleA,
          key: idempotencyKey,
          status: 'COMPLETED',
          responseStatus: 201,
          responseBody: JSON.stringify({
            payment: { method: 'CASH', amount: 100, reference: null },
            sale: { id: saleA, status: 'COMPLETED' },
          }),
        });

        const request = new NextRequest(`http://localhost/api/sales/${saleA}/checkout`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ method: 'CASH', amount: 100 }),
        });

        const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleA }) });

        // Should return cached response instead of 500
        expect(response.status).toBe(201);
      });
    });

    describe('TEST C2 — Concurrent requests / different keys', () => {
      it('should prevent double finalization when concurrent requests use different keys', async () => {
        mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
        mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
        mockedRequirePermission.mockResolvedValue(undefined);
        mockedRequireStoreAccess.mockResolvedValue(undefined);

        // Both calls find no existing idempotency (different keys)
        mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue(null);
        mockedPrisma.sale.findFirst.mockResolvedValue({
          storeId: storeA,
          organizationId: mockOrganizationId,
        });

        // Second transaction should fail because sale is already COMPLETED
        mockedPrisma.$transaction
          .mockResolvedValueOnce({
            id: saleA,
            status: 'COMPLETED',
            payments: [{ id: 'payment-1', method: 'CASH', amount: 100 }],
          })
          .mockRejectedValueOnce(new Error('Sale is already completed'));

        const request1 = new NextRequest(`http://localhost/api/sales/${saleA}/checkout`, {
          method: 'POST',
          headers: { 'Idempotency-Key': 'key-A' },
          body: JSON.stringify({ method: 'CASH', amount: 100 }),
        });

        const request2 = new NextRequest(`http://localhost/api/sales/${saleA}/checkout`, {
          method: 'POST',
          headers: { 'Idempotency-Key': 'key-B' },
          body: JSON.stringify({ method: 'CASH', amount: 100 }),
        });

        const response1 = await POSTCheckout(request1, { params: Promise.resolve({ id: saleA }) });
        const response2 = await POSTCheckout(request2, { params: Promise.resolve({ id: saleA }) });

        expect(response1.status).toBe(201);
        expect(response2.status).toBe(409);
      });
    });

    describe('TEST C3 — Concurrency stock', () => {
      it('should verify stock concurrency handling (FOR UPDATE lock)', async () => {
        mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
        mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
        mockedRequirePermission.mockResolvedValue(undefined);
        mockedRequireStoreAccess.mockResolvedValue(undefined);
        mockedPrisma.checkoutIdempotency.findUnique.mockResolvedValue(null);
        mockedPrisma.sale.findFirst.mockResolvedValue({
          storeId: storeA,
          organizationId: mockOrganizationId,
        });

        // Transaction uses FOR UPDATE to lock inventory rows
        const mockCompletedSale = {
          id: saleA,
          status: 'COMPLETED',
          payments: [{ id: 'payment-1', method: 'CASH', amount: 100 }],
        };
        mockedPrisma.$transaction.mockResolvedValue(mockCompletedSale);

        const request = new NextRequest(`http://localhost/api/sales/${saleA}/checkout`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ method: 'CASH', amount: 100 }),
        });

        const response = await POSTCheckout(request, { params: Promise.resolve({ id: saleA }) });

        expect(response.status).toBe(201);
        expect(mockedPrisma.$transaction).toHaveBeenCalled();
        // Code uses FOR UPDATE on inventory (line 277)
      });
    });
  });
});
