import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@omnikes/app/api/tax/route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@omnikes/lib/auth', () => ({
  requireCurrentOrganizationId: vi.fn(),
}));

vi.mock('@omnikes/lib/prisma', () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
    },
  },
}));

import { requireCurrentOrganizationId } from '@omnikes/lib/auth';
import { prisma } from '@omnikes/lib/prisma';

describe('GET /api/tax', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return tax configuration when organization has one', async () => {
    const mockOrganizationId = 'org-123';
    const mockTaxRate = 0.18;
    const mockCountry = 'HT';

    (requireCurrentOrganizationId as any).mockResolvedValue(mockOrganizationId);
    (prisma.organization.findUnique as any).mockResolvedValue({
      id: mockOrganizationId,
      taxConfiguration: {
        taxRate: mockTaxRate,
        country: mockCountry,
      },
    });

    const request = new NextRequest('http://localhost/api/tax');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      taxRate: mockTaxRate,
      country: mockCountry,
    });
    expect(requireCurrentOrganizationId).toHaveBeenCalledWith(request);
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: mockOrganizationId },
      include: { taxConfiguration: true },
    });
  });

  it('should return null tax rate when organization has no configuration', async () => {
    const mockOrganizationId = 'org-123';

    (requireCurrentOrganizationId as any).mockResolvedValue(mockOrganizationId);
    (prisma.organization.findUnique as any).mockResolvedValue({
      id: mockOrganizationId,
      taxConfiguration: null,
    });

    const request = new NextRequest('http://localhost/api/tax');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      taxRate: null,
      country: null,
    });
  });

  it('should return 404 when organization not found', async () => {
    const mockOrganizationId = 'org-123';

    (requireCurrentOrganizationId as any).mockResolvedValue(mockOrganizationId);
    (prisma.organization.findUnique as any).mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/tax');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: 'Organization not found' });
  });

  it('should return 401 when authentication fails', async () => {
    (requireCurrentOrganizationId as any).mockRejectedValue(
      new Error('Authentication required')
    );

    const request = new NextRequest('http://localhost/api/tax');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Authentication required' });
  });

  it('should return 500 on unexpected error', async () => {
    (requireCurrentOrganizationId as any).mockRejectedValue(
      new Error('Database connection failed')
    );

    const request = new NextRequest('http://localhost/api/tax');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Failed to get tax configuration' });
  });
});
