import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@omnikes/app/api/tax/route';
import { NextRequest } from 'next/server';

vi.mock('@omnikes/lib/auth', () => ({
  requireCurrentOrganizationId: vi.fn(),
}));

vi.mock('@omnikes/lib/prisma', () => ({
  prisma: { organization: { findUnique: vi.fn() } },
}));

import { requireCurrentOrganizationId } from '@omnikes/lib/auth';
import { prisma } from '@omnikes/lib/prisma';

describe('GET /api/tax', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the current organization fiscal settings', async () => {
    (requireCurrentOrganizationId as any).mockResolvedValue('org-123');
    (prisma.organization.findUnique as any).mockResolvedValue({
      id: 'org-123', country: 'HT', taxEnabled: true, taxRate: 0.18,
    });

    const request = new NextRequest('http://localhost/api/tax');
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true, taxRate: 0.18, country: 'HT' });
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-123' },
      select: { id: true, country: true, taxEnabled: true, taxRate: true },
    });
  });

  it('returns a disabled zero-rate configuration when taxation is disabled', async () => {
    (requireCurrentOrganizationId as any).mockResolvedValue('org-123');
    (prisma.organization.findUnique as any).mockResolvedValue({
      id: 'org-123', country: 'HT', taxEnabled: false, taxRate: 0,
    });

    const response = await GET(new NextRequest('http://localhost/api/tax'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: false, taxRate: 0, country: 'HT' });
  });

  it('returns 404 when organization is missing', async () => {
    (requireCurrentOrganizationId as any).mockResolvedValue('org-123');
    (prisma.organization.findUnique as any).mockResolvedValue(null);
    const response = await GET(new NextRequest('http://localhost/api/tax'));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Organization not found' });
  });

  it('returns 401 when authentication fails', async () => {
    (requireCurrentOrganizationId as any).mockRejectedValue(new Error('Authentication required'));
    const response = await GET(new NextRequest('http://localhost/api/tax'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Authentication required' });
  });

  it('returns 500 on unexpected errors', async () => {
    (requireCurrentOrganizationId as any).mockRejectedValue(new Error('Database connection failed'));
    const response = await GET(new NextRequest('http://localhost/api/tax'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to get tax configuration' });
  });
});
