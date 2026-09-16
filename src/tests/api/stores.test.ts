import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@omnikes/app/api/stores/route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@omnikes/lib/auth', () => ({
  requireCurrentOrganizationId: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock('@omnikes/services/store.service', () => ({
  storeService: {
    listStores: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('@omnikes/repositories/store.repository', () => ({
  storeRepository: {
    findByCode: vi.fn(),
  },
}));

vi.mock('@omnikes/lib/pagination', () => ({
  validatePagination: vi.fn(() => ({ skip: 0, take: 50 })),
}));

import { requireCurrentOrganizationId, requirePermission } from '@omnikes/lib/auth';
import { storeService } from '@omnikes/services/store.service';
import { storeRepository } from '@omnikes/repositories/store.repository';

describe('POST /api/stores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when not authenticated', async () => {
    (requireCurrentOrganizationId as any).mockRejectedValue(
      new Error('Authentication required')
    );

    const request = new NextRequest('http://localhost/api/stores', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Store', code: 'TEST' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Authentication required' });
  });

  it('should return 403 when authenticated but lacks store.create permission', async () => {
    const mockOrganizationId = 'org-123';
    (requireCurrentOrganizationId as any).mockResolvedValue(mockOrganizationId);
    (requirePermission as any).mockRejectedValue(
      new Error('Permission required: store.create')
    );

    const request = new NextRequest('http://localhost/api/stores', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Store', code: 'TEST' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toEqual({ error: 'Permission required' });
  });

  it('should return 400 when payload is invalid', async () => {
    const mockOrganizationId = 'org-123';
    (requireCurrentOrganizationId as any).mockResolvedValue(mockOrganizationId);
    (requirePermission as any).mockResolvedValue(undefined);

    const request = new NextRequest('http://localhost/api/stores', {
      method: 'POST',
      body: JSON.stringify({ name: '', code: '' }), // Invalid: empty strings
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid input data');
  });

  it('should return 409 when code already exists in organization', async () => {
    const mockOrganizationId = 'org-123';
    (requireCurrentOrganizationId as any).mockResolvedValue(mockOrganizationId);
    (requirePermission as any).mockResolvedValue(undefined);
    (storeRepository.findByCode as any).mockResolvedValue({ id: 'existing-store' });

    const request = new NextRequest('http://localhost/api/stores', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Store', code: 'TEST' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBe('Un magasin avec ce code existe déjà dans cette organisation.');
  });

  it('should return 201 when store is created successfully', async () => {
    const mockOrganizationId = 'org-123';
    const mockStore = {
      id: 'new-store-id',
      name: 'Test Store',
      code: 'TEST',
      isActive: true,
    };

    (requireCurrentOrganizationId as any).mockResolvedValue(mockOrganizationId);
    (requirePermission as any).mockResolvedValue(undefined);
    (storeRepository.findByCode as any).mockResolvedValue(null);
    (storeService.create as any).mockResolvedValue(mockStore);

    const request = new NextRequest('http://localhost/api/stores', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Store', code: 'TEST' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.store).toEqual(mockStore);
    expect(storeService.create).toHaveBeenCalledWith(mockOrganizationId, {
      name: 'Test Store',
      code: 'TEST',
      address: undefined,
      city: undefined,
      country: undefined,
      phone: undefined,
      email: undefined,
      isActive: true,
    });
  });

  it('should ignore organizationId from body and use session', async () => {
    const mockOrganizationId = 'org-123';
    const mockStore = { id: 'new-store-id', name: 'Test Store', code: 'TEST' };

    (requireCurrentOrganizationId as any).mockResolvedValue(mockOrganizationId);
    (requirePermission as any).mockResolvedValue(undefined);
    (storeRepository.findByCode as any).mockResolvedValue(null);
    (storeService.create as any).mockResolvedValue(mockStore);

    const request = new NextRequest('http://localhost/api/stores', {
      method: 'POST',
      body: JSON.stringify({ 
        name: 'Test Store', 
        code: 'TEST',
        organizationId: 'different-org-id' // Should be ignored
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(storeService.create).toHaveBeenCalledWith(mockOrganizationId, expect.any(Object));
    // Verify the organizationId used is from session, not from body
    expect(storeService.create).toHaveBeenCalledWith('org-123', expect.any(Object));
  });
});
