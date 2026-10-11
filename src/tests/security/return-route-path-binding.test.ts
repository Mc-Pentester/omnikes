import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createReturn } from '../../app/api/sales/[id]/returns/route';

vi.mock('@omnikes/lib/auth', () => ({
  requireCurrentOrganizationId: vi.fn(),
  requirePermission: vi.fn(),
  requireStoreAccess: vi.fn(),
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('@omnikes/lib/prisma', () => ({
  prisma: {
    sale: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@omnikes/services/return.service', () => ({
  returnService: {
    create: vi.fn(),
  },
}));

import {
  requireCurrentOrganizationId,
  requirePermission,
  requireStoreAccess,
  getAuthenticatedUser,
} from '@omnikes/lib/auth';
import { prisma } from '@omnikes/lib/prisma';
import { returnService } from '@omnikes/services/return.service';

const mockOrg = requireCurrentOrganizationId as ReturnType<typeof vi.fn>;
const mockPermission = requirePermission as ReturnType<typeof vi.fn>;
const mockStoreAccess = requireStoreAccess as ReturnType<typeof vi.fn>;
const mockUser = getAuthenticatedUser as ReturnType<typeof vi.fn>;
const mockSaleFindFirst = prisma.sale.findFirst as ReturnType<typeof vi.fn>;
const mockCreateReturn = returnService.create as ReturnType<typeof vi.fn>;

const saleA = 'cm123456789012345678901234';
const saleB = 'cm223456789012345678901234';
const saleItemId = 'cm323456789012345678901234';
const storeA = 'cm423456789012345678901234';
const orgId = 'org-test';

function requestFor(pathSaleId: string, bodySaleId: string) {
  return new NextRequest(`http://localhost/api/sales/${pathSaleId}/returns`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Idempotency-Key': 'return-route-test-001',
    },
    body: JSON.stringify({
      saleId: bodySaleId,
      items: [{ saleItemId, quantity: 1 }],
      reason: 'Route binding test',
    }),
  });
}

describe('Return route sale ID binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrg.mockResolvedValue(orgId);
    mockPermission.mockResolvedValue(undefined);
    mockUser.mockResolvedValue({ id: 'user-a', organizationId: orgId });
    mockStoreAccess.mockResolvedValue(undefined);
    mockSaleFindFirst.mockResolvedValue({ storeId: storeA, organizationId: orgId });
    mockCreateReturn.mockResolvedValue({ id: 'return-test' });
  });

  it('rejects a body saleId that differs from the sale ID in the URL before reading or mutating a sale', async () => {
    const response = await createReturn(requestFor(saleA, saleB), {
      params: Promise.resolve({ id: saleA }),
    });

    expect(response.status).toBe(400);
    expect(mockSaleFindFirst).not.toHaveBeenCalled();
    expect(mockCreateReturn).not.toHaveBeenCalled();
  });

  it('authorizes and creates a return when the body saleId matches the URL', async () => {
    const response = await createReturn(requestFor(saleA, saleA), {
      params: Promise.resolve({ id: saleA }),
    });

    expect(response.status).toBe(201);
    expect(mockSaleFindFirst).toHaveBeenCalledWith({
      where: { id: saleA, organizationId: orgId },
      select: { storeId: true, organizationId: true },
    });
    expect(mockStoreAccess).toHaveBeenCalledWith(expect.anything(), storeA);
    expect(mockCreateReturn).toHaveBeenCalledWith(
      orgId,
      'user-a',
      expect.objectContaining({ saleId: saleA }),
    );
  });
});
