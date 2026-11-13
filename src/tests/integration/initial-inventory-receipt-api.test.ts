import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@omnikes/lib/auth', () => ({
  requireCurrentOrganizationId: vi.fn(),
  requirePermission: vi.fn(),
  requireStoreAccess: vi.fn(),
}));

vi.mock('@omnikes/repositories/inventory.repository', () => ({
  inventoryRepository: {
    findOrCreate: vi.fn(),
  },
}));

vi.mock('@omnikes/services/inventory.service', () => ({
  inventoryService: {
    receiveInventory: vi.fn(),
  },
}));

import {
  requireCurrentOrganizationId,
  requirePermission,
  requireStoreAccess,
} from '@omnikes/lib/auth';
import { inventoryRepository } from '@omnikes/repositories/inventory.repository';
import { inventoryService } from '@omnikes/services/inventory.service';
import { POST } from '@omnikes/app/api/inventory/receive/route';

const storeId = 'store-integration-test';
const variantId = 'variant-integration-test';
const inventoryId = 'inventory-integration-test';

function requestWith(body: unknown) {
  return new NextRequest('http://localhost/api/inventory/receive', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('initial inventory receipt API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCurrentOrganizationId).mockResolvedValue('org-integration-test');
    vi.mocked(requirePermission).mockResolvedValue(undefined);
    vi.mocked(requireStoreAccess).mockResolvedValue(undefined);
    vi.mocked(inventoryRepository.findOrCreate).mockResolvedValue({ id: inventoryId } as never);
    vi.mocked(inventoryService.receiveInventory).mockResolvedValue({
      id: inventoryId,
      quantity: 8,
    } as never);
  });

  it('creates the first inventory row and records the initial receipt', async () => {
    const response = await POST(requestWith({
      storeId,
      variantId,
      quantity: 8,
      referenceId: 'OPENING-STOCK-001',
    }));

    expect(response.status).toBe(200);
    expect(inventoryRepository.findOrCreate).toHaveBeenCalledWith(
      storeId,
      variantId,
      'org-integration-test',
    );
    expect(inventoryService.receiveInventory).toHaveBeenCalledWith(
      inventoryId,
      'org-integration-test',
      { quantity: 8, referenceId: 'OPENING-STOCK-001', notes: undefined },
    );
  });

  it('rejects an unauthorized store before creating inventory', async () => {
    vi.mocked(requireStoreAccess).mockRejectedValue(
      new Error('Not authorized to access this store'),
    );

    const response = await POST(requestWith({ storeId, variantId, quantity: 8 }));

    expect(response.status).toBe(403);
    expect(inventoryRepository.findOrCreate).not.toHaveBeenCalled();
    expect(inventoryService.receiveInventory).not.toHaveBeenCalled();
  });

  it('rejects a variant outside the current organization', async () => {
    vi.mocked(inventoryRepository.findOrCreate).mockRejectedValue(
      new Error('Store or product variant not found or access denied'),
    );

    const response = await POST(requestWith({ storeId, variantId, quantity: 8 }));

    expect(response.status).toBe(404);
    expect(inventoryService.receiveInventory).not.toHaveBeenCalled();
  });

  it('requires authentication before checking permissions or touching inventory', async () => {
    vi.mocked(requireCurrentOrganizationId).mockRejectedValue(
      new Error('Authentication required'),
    );

    const response = await POST(requestWith({ storeId, variantId, quantity: 8 }));

    expect(response.status).toBe(401);
    expect(requirePermission).not.toHaveBeenCalled();
    expect(inventoryRepository.findOrCreate).not.toHaveBeenCalled();
  });

  it('rejects zero or negative receipt quantities without creating inventory', async () => {
    const response = await POST(requestWith({ storeId, variantId, quantity: 0 }));

    expect(response.status).toBe(400);
    expect(inventoryRepository.findOrCreate).not.toHaveBeenCalled();
  });
});
