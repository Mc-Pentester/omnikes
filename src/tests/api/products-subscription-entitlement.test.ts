import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@omnikes/lib/auth', () => ({
  requireCurrentOrganizationId: vi.fn(),
  requirePermission: vi.fn(),
  requireSubscriptionCapability: vi.fn(),
  getAuthorizedStoreIds: vi.fn(),
}));

vi.mock('@omnikes/services/product.service', () => ({
  productService: {
    create: vi.fn(),
    list: vi.fn(),
    getByBarcode: vi.fn(),
  },
}));

import {
  requireCurrentOrganizationId,
  requirePermission,
  requireSubscriptionCapability,
} from '@omnikes/lib/auth';
import { productService } from '@omnikes/services/product.service';
import { POST } from '@omnikes/app/api/products/route';

describe('POST /api/products subscription entitlement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCurrentOrganizationId).mockResolvedValue('org-test');
    vi.mocked(requirePermission).mockResolvedValue(undefined);
  });

  it('returns 402 when the current plan does not include inventory writes', async () => {
    vi.mocked(requireSubscriptionCapability).mockRejectedValue(
      new Error('Subscription entitlement required: inventory.core'),
    );

    const request = new NextRequest('http://localhost/api/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(402);
    expect(payload.error).toBe('Subscription entitlement required: inventory.core');
    expect(productService.create).not.toHaveBeenCalled();
  });
});
