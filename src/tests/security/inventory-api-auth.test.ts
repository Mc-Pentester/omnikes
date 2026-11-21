import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@omnikes/lib/auth', () => ({
  requireCurrentOrganizationId: vi.fn(),
  requirePermission: vi.fn(),
  requireStoreAccess: vi.fn(),
  requireSubscriptionCapability: vi.fn(),
}));

vi.mock('@omnikes/services/inventory.service', () => ({
  inventoryService: {
    getById: vi.fn(),
    listMovements: vi.fn(),
    createMovement: vi.fn(),
  },
}));

vi.mock('@omnikes/lib/validation', () => ({
  inventoryMovementSchema: {
    parse: vi.fn((value) => value),
  },
}));

vi.mock('@omnikes/lib/pagination', () => ({
  validatePagination: vi.fn(() => ({ skip: 0, take: 50 })),
}));

import {
  requireCurrentOrganizationId,
  requirePermission,
  requireStoreAccess,
  requireSubscriptionCapability,
} from '@omnikes/lib/auth';
import { inventoryService } from '@omnikes/services/inventory.service';
import { inventoryMovementSchema } from '@omnikes/lib/validation';
import { GET, POST } from '@omnikes/app/api/inventory/[id]/movements/route';

const inventoryId = 'c123456789012345678901234';
const storeId = 'c223456789012345678901234';

const requestFor = (method: string, body?: unknown) =>
  new NextRequest(`http://localhost/api/inventory/${inventoryId}/movements`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const validMovement = {
  type: 'ADJUSTMENT',
  quantity: 1,
  reason: 'test',
};

describe('P1-G inventory API authorization contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (requireCurrentOrganizationId as any).mockResolvedValue('org-p1g');
    (requirePermission as any).mockResolvedValue(undefined);
    (requireStoreAccess as any).mockResolvedValue(undefined);
    (requireSubscriptionCapability as any).mockResolvedValue(undefined);
    (inventoryService.getById as any).mockResolvedValue({ id: inventoryId, storeId });
    (inventoryService.listMovements as any).mockResolvedValue({ movements: [], total: 0 });
    (inventoryService.createMovement as any).mockResolvedValue({ id: 'movement-p1g' });
  });

  it('GET returns 401 before permission/service access when unauthenticated', async () => {
    (requireCurrentOrganizationId as any).mockRejectedValue(new Error('Authentication required'));

    const response = await GET(requestFor('GET'), { params: Promise.resolve({ id: inventoryId }) });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Authentication required' });
    expect(requirePermission).not.toHaveBeenCalled();
    expect(inventoryService.getById).not.toHaveBeenCalled();
  });

  it('POST returns 403 before inventory mutation when permission is missing', async () => {
    (requirePermission as any).mockRejectedValue(new Error('Permission required: inventory.adjust'));

    const response = await POST(requestFor('POST', validMovement), {
      params: Promise.resolve({ id: inventoryId }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Permission required' });
    expect(requireSubscriptionCapability).not.toHaveBeenCalled();
    expect(inventoryService.getById).not.toHaveBeenCalled();
    expect(inventoryService.createMovement).not.toHaveBeenCalled();
  });

  it('POST returns 403 for an unauthorized store before movement creation', async () => {
    (requireStoreAccess as any).mockRejectedValue(new Error('Not authorized to access this store'));

    const response = await POST(requestFor('POST', validMovement), {
      params: Promise.resolve({ id: inventoryId }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Not authorized to access this store' });
    expect(requireStoreAccess).toHaveBeenCalledWith(expect.anything(), storeId);
    expect(requireSubscriptionCapability).not.toHaveBeenCalled();
    expect(inventoryService.createMovement).not.toHaveBeenCalled();
  });

  it('POST returns 402 and performs no inventory mutation when subscription entitlement is denied', async () => {
    (requireSubscriptionCapability as any).mockRejectedValue(
      new Error('Subscription entitlement required: inventory.core (subscription_expired)'),
    );

    const response = await POST(requestFor('POST', validMovement), {
      params: Promise.resolve({ id: inventoryId }),
    });

    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({
      error: 'Subscription entitlement required: inventory.core (subscription_expired)',
    });
    expect(requireSubscriptionCapability).toHaveBeenCalledWith(
      expect.anything(),
      'inventory.core',
      'WRITE',
    );
    expect(inventoryService.getById).not.toHaveBeenCalled();
    expect(inventoryService.createMovement).not.toHaveBeenCalled();
  });

  it('POST creates a movement with an allowed entitlement and returns 201', async () => {
    const response = await POST(requestFor('POST', validMovement), {
      params: Promise.resolve({ id: inventoryId }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'movement-p1g' });
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), 'inventory.adjust');
    expect(requireSubscriptionCapability).toHaveBeenCalledWith(
      expect.anything(),
      'inventory.core',
      'WRITE',
    );
    expect(requireStoreAccess).toHaveBeenCalledWith(expect.anything(), storeId);
    expect(inventoryService.createMovement).toHaveBeenCalledWith(
      inventoryId,
      'org-p1g',
      expect.objectContaining({ ...validMovement, inventoryId }),
    );
  });

  it('POST rejects invalid movement data with 400 before mutation', async () => {
    const { z } = await import('zod');
    (inventoryMovementSchema as any).parse.mockImplementationOnce(() => {
      throw new z.ZodError([]);
    });

    const response = await POST(requestFor('POST', {
      type: 'PURCHASE',
      quantity: -5,
    }), { params: Promise.resolve({ id: inventoryId }) });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Invalid movement data');
    expect(inventoryService.createMovement).not.toHaveBeenCalled();
  });
});
