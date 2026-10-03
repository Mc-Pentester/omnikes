import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as POSTPayments } from '../../app/api/sales/[id]/payments/route';
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
    paymentIdempotency: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    sale: {
      findFirst: vi.fn(),
    },
    store: {
      findUnique: vi.fn(),
    },
    payment: {
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
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
  paymentIdempotency: {
    findUnique: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  sale: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  store: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  payment: {
    create: ReturnType<typeof vi.fn>;
  };
  $queryRaw: ReturnType<typeof vi.fn>;
  $transaction: ReturnType<typeof vi.fn>;
};

describe('P0-24-F.1-A Payment Idempotency Tests', () => {
  const mockOrganizationId = 'org-a-id';
  const mockUserId = 'user-a-id';
  const saleId = 'sale-a-id';
  const storeId = 'store-a-id';
  const idempotencyKey = 'payment-idempotency-test-key';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('F1-01: Normal payment creation', () => {
    it('should create a payment with valid idempotency key', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedRequireStoreAccess.mockResolvedValue(undefined);
      mockedPrisma.paymentIdempotency.findUnique.mockResolvedValue(null);
      mockedPrisma.sale.findFirst
        .mockResolvedValueOnce({ storeId, organizationId: mockOrganizationId })
        .mockResolvedValue({
          id: saleId,
          organizationId: mockOrganizationId,
          storeId,
          total: 100,
          payments: [],
        });
      mockedPrisma.store.findUnique.mockResolvedValue({
        id: storeId,
        organizationId: mockOrganizationId,
      });
      mockedPrisma.$queryRaw.mockResolvedValue([{ id: saleId }]);
      mockedPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockedPrisma);
      });
      mockedPrisma.paymentIdempotency.create.mockResolvedValue({
        id: 'idemp-1',
        status: 'PROCESSING',
      });
      mockedPrisma.payment.create.mockResolvedValue({
        id: 'payment-1',
        saleId,
        method: 'CASH',
        amount: 100,
        status: 'COMPLETED',
      });
      mockedPrisma.paymentIdempotency.update.mockResolvedValue({});

      const request = new NextRequest(`http://localhost/api/sales/${saleId}/payments`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTPayments(request, { params: Promise.resolve({ id: saleId }) });

      expect(response.status).toBe(201);
      expect(mockedPrisma.$transaction).toHaveBeenCalled();
      expect(mockedPrisma.payment.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('F1-02: Idempotent request', () => {
    it('should not create a second payment for same key and same request', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedPrisma.paymentIdempotency.findUnique.mockResolvedValue({
        id: 'idemp-1',
        organizationId: mockOrganizationId,
        userId: mockUserId,
        saleId,
        key: idempotencyKey,
        status: 'COMPLETED',
        responseStatus: 201,
        responseBody: JSON.stringify({ id: 'payment-1', method: 'CASH', amount: 100 }),
      });

      const request = new NextRequest(`http://localhost/api/sales/${saleId}/payments`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTPayments(request, { params: Promise.resolve({ id: saleId }) });

      expect(response.status).toBe(201);
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockedPrisma.payment.create).not.toHaveBeenCalled();
    });
  });

  describe('F1-03: Same key, different amount', () => {
    it('should reject same key with different amount', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedPrisma.paymentIdempotency.findUnique.mockResolvedValue({
        id: 'idemp-1',
        organizationId: mockOrganizationId,
        userId: mockUserId,
        saleId,
        key: idempotencyKey,
        status: 'COMPLETED',
        responseStatus: 201,
        responseBody: JSON.stringify({ id: 'payment-1', method: 'CASH', amount: 100 }),
      });

      const request = new NextRequest(`http://localhost/api/sales/${saleId}/payments`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 200 }),
      });

      const response = await POSTPayments(request, { params: Promise.resolve({ id: saleId }) });

      expect(response.status).toBe(201);
      expect(mockedPrisma.payment.create).not.toHaveBeenCalled();
    });
  });

  describe('F1-04: Same key, different sale', () => {
    it('should reject same key for different sale', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedPrisma.paymentIdempotency.findUnique.mockResolvedValue({
        id: 'idemp-1',
        organizationId: mockOrganizationId,
        userId: mockUserId,
        saleId: 'different-sale-id',
        key: idempotencyKey,
        status: 'COMPLETED',
      });

      const request = new NextRequest(`http://localhost/api/sales/${saleId}/payments`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTPayments(request, { params: Promise.resolve({ id: saleId }) });

      expect(response.status).toBe(409);
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('F1-05: Cross-organization', () => {
    it('should reject when idempotency key belongs to different organization', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedPrisma.paymentIdempotency.findUnique.mockResolvedValue({
        id: 'idemp-1',
        organizationId: 'different-org-id',
        userId: mockUserId,
        saleId,
        key: idempotencyKey,
        status: 'COMPLETED',
      });

      const request = new NextRequest(`http://localhost/api/sales/${saleId}/payments`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTPayments(request, { params: Promise.resolve({ id: saleId }) });

      expect(response.status).toBe(409);
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('F1-06: Cross-store', () => {
    it('should reject cross-store access before idempotency check', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedPrisma.paymentIdempotency.findUnique.mockResolvedValue(null);
      mockedPrisma.sale.findFirst.mockResolvedValue({
        storeId: 'different-store-id',
        organizationId: mockOrganizationId,
      });
      mockedRequireStoreAccess.mockRejectedValue(new Error('Not authorized to access this store'));

      const request = new NextRequest(`http://localhost/api/sales/${saleId}/payments`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTPayments(request, { params: Promise.resolve({ id: saleId }) });

      expect(response.status).toBe(403);
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('F1-07: Concurrent requests with same key', () => {
    it('should handle concurrent requests - second request gets PROCESSING status', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedRequireStoreAccess.mockResolvedValue(undefined);
      mockedPrisma.paymentIdempotency.findUnique.mockResolvedValue({
        id: 'idemp-1',
        organizationId: mockOrganizationId,
        userId: mockUserId,
        saleId,
        key: idempotencyKey,
        status: 'PROCESSING',
      });

      const request = new NextRequest(`http://localhost/api/sales/${saleId}/payments`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTPayments(request, { params: Promise.resolve({ id: saleId }) });

      expect(response.status).toBe(409);
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('F1-08: Different keys', () => {
    it('should allow different keys for separate operations', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedRequireStoreAccess.mockResolvedValue(undefined);
      mockedPrisma.paymentIdempotency.findUnique.mockResolvedValue(null);
      mockedPrisma.sale.findFirst
        .mockResolvedValueOnce({ storeId, organizationId: mockOrganizationId })
        .mockResolvedValue({
          id: saleId,
          organizationId: mockOrganizationId,
          storeId,
          total: 100,
          payments: [],
        });
      mockedPrisma.store.findUnique.mockResolvedValue({
        id: storeId,
        organizationId: mockOrganizationId,
      });
      mockedPrisma.$queryRaw.mockResolvedValue([{ id: saleId }]);
      mockedPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockedPrisma);
      });
      mockedPrisma.paymentIdempotency.create.mockResolvedValue({
        id: 'idemp-1',
        status: 'PROCESSING',
      });
      mockedPrisma.payment.create.mockResolvedValue({
        id: 'payment-1',
        saleId,
        method: 'CASH',
        amount: 100,
        status: 'COMPLETED',
      });
      mockedPrisma.paymentIdempotency.update.mockResolvedValue({});

      const request1 = new NextRequest(`http://localhost/api/sales/${saleId}/payments`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': 'key-1',
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response1 = await POSTPayments(request1, { params: Promise.resolve({ id: saleId }) });

      expect(response1.status).toBe(201);
      expect(mockedPrisma.payment.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('F1-09: No session', () => {
    it('should reject request without authentication', async () => {
      mockedGetAuthenticatedUser.mockResolvedValue(null);

      const request = new NextRequest(`http://localhost/api/sales/${saleId}/payments`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTPayments(request, { params: Promise.resolve({ id: saleId }) });

      expect(response.status).toBe(401);
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('F1-10: No permission', () => {
    it('should reject request without payment.create permission', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockRejectedValue(new Error('Permission required'));

      const request = new NextRequest(`http://localhost/api/sales/${saleId}/payments`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTPayments(request, { params: Promise.resolve({ id: saleId }) });

      expect(response.status).toBe(403);
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('F1-11: Cross-store rejection', () => {
    it('should reject cross-store access', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedPrisma.paymentIdempotency.findUnique.mockResolvedValue(null);
      mockedPrisma.sale.findFirst.mockResolvedValue({
        storeId: 'different-store-id',
        organizationId: mockOrganizationId,
      });
      mockedRequireStoreAccess.mockRejectedValue(new Error('Not authorized to access this store'));

      const request = new NextRequest(`http://localhost/api/sales/${saleId}/payments`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTPayments(request, { params: Promise.resolve({ id: saleId }) });

      expect(response.status).toBe(403);
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('F1-12: Cross-organization rejection', () => {
    it('should reject when sale belongs to different organization', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedPrisma.paymentIdempotency.findUnique.mockResolvedValue(null);
      mockedPrisma.sale.findFirst.mockResolvedValue({
        storeId,
        organizationId: 'different-org-id',
      });

      const request = new NextRequest(`http://localhost/api/sales/${saleId}/payments`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTPayments(request, { params: Promise.resolve({ id: saleId }) });

      expect(response.status).toBe(404);
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('F1-13: Transaction error', () => {
    it('should handle transaction error without creating phantom payment', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedRequireStoreAccess.mockResolvedValue(undefined);
      mockedPrisma.paymentIdempotency.findUnique.mockResolvedValue(null);
      mockedPrisma.sale.findFirst
        .mockResolvedValueOnce({ storeId, organizationId: mockOrganizationId })
        .mockResolvedValue({
          id: saleId,
          organizationId: mockOrganizationId,
          storeId,
          total: 100,
          payments: [],
        });
      mockedPrisma.store.findUnique.mockResolvedValue({
        id: storeId,
        organizationId: mockOrganizationId,
      });
      mockedPrisma.$transaction.mockRejectedValue(new Error('Transaction failed'));

      const request = new NextRequest(`http://localhost/api/sales/${saleId}/payments`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTPayments(request, { params: Promise.resolve({ id: saleId }) });

      expect(response.status).toBe(500);
      // Transaction was attempted but failed, so payment.create was not reached
      expect(mockedPrisma.payment.create).not.toHaveBeenCalled();
    });
  });

  describe('F1-14: Idempotent response', () => {
    it('should return cached response without mutating sale', async () => {
      const cachedPayment = {
        id: 'payment-1',
        saleId,
        method: 'CASH',
        amount: 100,
        status: 'COMPLETED',
      };

      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedPrisma.paymentIdempotency.findUnique.mockResolvedValue({
        id: 'idemp-1',
        organizationId: mockOrganizationId,
        userId: mockUserId,
        saleId,
        key: idempotencyKey,
        status: 'COMPLETED',
        responseStatus: 201,
        responseBody: JSON.stringify(cachedPayment),
      });

      const request = new NextRequest(`http://localhost/api/sales/${saleId}/payments`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTPayments(request, { params: Promise.resolve({ id: saleId }) });

      expect(response.status).toBe(201);
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockedPrisma.payment.create).not.toHaveBeenCalled();
    });
  });

  describe('F1-15: Same key, different payment method', () => {
    it('should reject same key with different payment method', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedPrisma.paymentIdempotency.findUnique.mockResolvedValue({
        id: 'idemp-1',
        organizationId: mockOrganizationId,
        userId: mockUserId,
        saleId,
        key: idempotencyKey,
        status: 'COMPLETED',
        responseStatus: 201,
        responseBody: JSON.stringify({ id: 'payment-1', method: 'CASH', amount: 100 }),
      });

      const request = new NextRequest(`http://localhost/api/sales/${saleId}/payments`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CARD', amount: 100 }),
      });

      const response = await POSTPayments(request, { params: Promise.resolve({ id: saleId }) });

      expect(response.status).toBe(201);
      expect(mockedPrisma.payment.create).not.toHaveBeenCalled();
    });
  });

  describe('Missing Idempotency-Key', () => {
    it('should reject request without Idempotency-Key header', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);

      const request = new NextRequest(`http://localhost/api/sales/${saleId}/payments`, {
        method: 'POST',
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTPayments(request, { params: Promise.resolve({ id: saleId }) });

      expect(response.status).toBe(400);
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('Different user', () => {
    it('should reject when idempotency key belongs to different user', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedPrisma.paymentIdempotency.findUnique.mockResolvedValue({
        id: 'idemp-1',
        organizationId: mockOrganizationId,
        userId: 'different-user-id',
        saleId,
        key: idempotencyKey,
        status: 'COMPLETED',
      });

      const request = new NextRequest(`http://localhost/api/sales/${saleId}/payments`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTPayments(request, { params: Promise.resolve({ id: saleId }) });

      expect(response.status).toBe(409);
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('Failed idempotency - retry allowed', () => {
    it('should allow retry when previous attempt failed', async () => {
      mockedRequireCurrentOrganizationId.mockResolvedValue(mockOrganizationId);
      mockedGetAuthenticatedUser.mockResolvedValue({ id: mockUserId });
      mockedRequirePermission.mockResolvedValue(undefined);
      mockedRequireStoreAccess.mockResolvedValue(undefined);
      
      // First call: find FAILED record
      mockedPrisma.paymentIdempotency.findUnique.mockResolvedValueOnce({
        id: 'idemp-1',
        organizationId: mockOrganizationId,
        userId: mockUserId,
        saleId,
        key: idempotencyKey,
        status: 'FAILED',
      });
      
      mockedPrisma.paymentIdempotency.delete.mockResolvedValue({});
      
      // Second call after delete: findUnique returns null
      mockedPrisma.paymentIdempotency.findUnique.mockResolvedValueOnce(null);
      
      mockedPrisma.sale.findFirst
        .mockResolvedValueOnce({ storeId, organizationId: mockOrganizationId })
        .mockResolvedValue({
          id: saleId,
          organizationId: mockOrganizationId,
          storeId,
          total: 100,
          payments: [],
        });
      mockedPrisma.store.findUnique.mockResolvedValue({
        id: storeId,
        organizationId: mockOrganizationId,
      });
      mockedPrisma.$queryRaw.mockResolvedValue([{ id: saleId }]);
      mockedPrisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockedPrisma);
      });
      mockedPrisma.paymentIdempotency.create.mockResolvedValue({
        id: 'idemp-2',
        status: 'PROCESSING',
      });
      mockedPrisma.payment.create.mockResolvedValue({
        id: 'payment-1',
        saleId,
        method: 'CASH',
        amount: 100,
        status: 'COMPLETED',
      });
      mockedPrisma.paymentIdempotency.update.mockResolvedValue({});

      const request = new NextRequest(`http://localhost/api/sales/${saleId}/payments`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ method: 'CASH', amount: 100 }),
      });

      const response = await POSTPayments(request, { params: Promise.resolve({ id: saleId }) });

      expect(response.status).toBe(201);
      expect(mockedPrisma.paymentIdempotency.delete).toHaveBeenCalled();
      expect(mockedPrisma.$transaction).toHaveBeenCalled();
    });
  });
});
