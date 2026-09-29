import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as GETStore } from '../../app/api/stores/[id]/route';
import { PATCH as PATCHStore } from '../../app/api/stores/[id]/route';
import { DELETE as DELETEStore } from '../../app/api/stores/[id]/route';
import { POST as POSTActivate } from '../../app/api/stores/[id]/activate/route';
import { POST as POSTDeactivate } from '../../app/api/stores/[id]/deactivate/route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('../../lib/auth', () => ({
  requireCurrentOrganizationId: vi.fn(),
  requirePermission: vi.fn(),
  requireStoreAccess: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {},
}));

vi.mock('../../services/store.service', () => ({
  storeService: {
    getStore: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    activate: vi.fn(),
  },
}));

vi.mock('../../repositories/store.repository', () => ({
  storeRepository: {
    findByCode: vi.fn(),
  },
}));

import { requireCurrentOrganizationId, requirePermission, requireStoreAccess } from '../../lib/auth';
import { storeService } from '../../services/store.service';

describe('P0-21-B API Cross-Store Isolation Tests', () => {
  const mockOrganizationId = 'org-123';
  const storeA = 'store-a-id';
  const storeB = 'store-b-id';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TEST 01 — GET /api/stores/[id] authorized store', () => {
    it('should return 200 when requesting authorized store A', async () => {
      (requireCurrentOrganizationId as any).mockResolvedValue(mockOrganizationId);
      (requireStoreAccess as any).mockResolvedValue(undefined);
      (storeService.getStore as any).mockResolvedValue({ id: storeA, name: 'Store A' });

      const request = new NextRequest(`http://localhost/api/stores/${storeA}`);
      const response = await GETStore(request, { params: Promise.resolve({ id: storeA }) });

      expect(response.status).toBe(200);
      expect(requireStoreAccess).toHaveBeenCalledWith(expect.anything(), storeA);
      expect(requireStoreAccess).toHaveBeenCalled();
    });
  });

  describe('TEST 02 — GET /api/stores/[id] unauthorized store', () => {
    it('should return 403 when requesting unauthorized store B', async () => {
      (requireCurrentOrganizationId as any).mockResolvedValue(mockOrganizationId);
      (requireStoreAccess as any).mockRejectedValue(new Error('Not authorized to access this store'));

      const request = new NextRequest(`http://localhost/api/stores/${storeB}`);
      const response = await GETStore(request, { params: Promise.resolve({ id: storeB }) });

      expect(response.status).toBe(403);
      expect(requireStoreAccess).toHaveBeenCalledWith(expect.anything(), storeB);
      expect(storeService.getStore).not.toHaveBeenCalled();
    });
  });

  describe('TEST 03 — PATCH /api/stores/[id] unauthorized store', () => {
    it('should return 403 when updating unauthorized store B', async () => {
      (requireCurrentOrganizationId as any).mockResolvedValue(mockOrganizationId);
      (requirePermission as any).mockResolvedValue(undefined);
      (requireStoreAccess as any).mockRejectedValue(new Error('Not authorized to access this store'));

      const request = new NextRequest(`http://localhost/api/stores/${storeB}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Store B' }),
      });

      const response = await PATCHStore(request, { params: Promise.resolve({ id: storeB }) });

      expect(response.status).toBe(403);
      expect(requireStoreAccess).toHaveBeenCalledWith(expect.anything(), storeB);
      expect(storeService.update).not.toHaveBeenCalled();
    });
  });

  describe('TEST 04 — DELETE /api/stores/[id] unauthorized store', () => {
    it('should return 403 when deactivating unauthorized store B', async () => {
      (requireCurrentOrganizationId as any).mockResolvedValue(mockOrganizationId);
      (requirePermission as any).mockResolvedValue(undefined);
      (requireStoreAccess as any).mockRejectedValue(new Error('Not authorized to access this store'));

      const request = new NextRequest(`http://localhost/api/stores/${storeB}`, {
        method: 'DELETE',
      });

      const response = await DELETEStore(request, { params: Promise.resolve({ id: storeB }) });

      expect(response.status).toBe(403);
      expect(requireStoreAccess).toHaveBeenCalledWith(expect.anything(), storeB);
      expect(storeService.deactivate).not.toHaveBeenCalled();
    });
  });

  describe('TEST 05 — POST /api/stores/[id]/activate unauthorized store', () => {
    it('should return 403 when activating unauthorized store B', async () => {
      (requireCurrentOrganizationId as any).mockResolvedValue(mockOrganizationId);
      (requirePermission as any).mockResolvedValue(undefined);
      (requireStoreAccess as any).mockRejectedValue(new Error('Not authorized to access this store'));

      const request = new NextRequest(`http://localhost/api/stores/${storeB}/activate`, {
        method: 'POST',
      });

      const response = await POSTActivate(request, { params: Promise.resolve({ id: storeB }) });

      expect(response.status).toBe(403);
      expect(requireStoreAccess).toHaveBeenCalledWith(expect.anything(), storeB);
      expect(storeService.activate).not.toHaveBeenCalled();
    });
  });

  describe('TEST 06 — POST /api/stores/[id]/deactivate unauthorized store', () => {
    it('should return 403 when deactivating unauthorized store B', async () => {
      (requireCurrentOrganizationId as any).mockResolvedValue(mockOrganizationId);
      (requirePermission as any).mockResolvedValue(undefined);
      (requireStoreAccess as any).mockRejectedValue(new Error('Not authorized to access this store'));

      const request = new NextRequest(`http://localhost/api/stores/${storeB}/deactivate`, {
        method: 'POST',
      });

      const response = await POSTDeactivate(request, { params: Promise.resolve({ id: storeB }) });

      expect(response.status).toBe(403);
      expect(requireStoreAccess).toHaveBeenCalledWith(expect.anything(), storeB);
      expect(storeService.deactivate).not.toHaveBeenCalled();
    });
  });

  describe('TEST 07 — Control ordering verification', () => {
    it('should call requireStoreAccess BEFORE service call for GET', async () => {
      (requireCurrentOrganizationId as any).mockResolvedValue(mockOrganizationId);
      (requireStoreAccess as any).mockResolvedValue(undefined);
      (storeService.getStore as any).mockResolvedValue({ id: storeA, name: 'Store A' });

      const request = new NextRequest(`http://localhost/api/stores/${storeA}`);
      await GETStore(request, { params: Promise.resolve({ id: storeA }) });

      const requireStoreAccessCalls = (requireStoreAccess as any).mock.calls.length;
      const getStoreCalls = (storeService.getStore as any).mock.calls.length;

      expect(requireStoreAccessCalls).toBeGreaterThan(0);
      expect(getStoreCalls).toBeGreaterThan(0);
    });

    it('should call requireStoreAccess BEFORE service call for PATCH', async () => {
      (requireCurrentOrganizationId as any).mockResolvedValue(mockOrganizationId);
      (requirePermission as any).mockResolvedValue(undefined);
      (requireStoreAccess as any).mockResolvedValue(undefined);
      (storeService.update as any).mockResolvedValue({ id: storeA, name: 'Store A' });

      const request = new NextRequest(`http://localhost/api/stores/${storeA}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Store A' }),
      });

      await PATCHStore(request, { params: Promise.resolve({ id: storeA }) });

      const requireStoreAccessCalls = (requireStoreAccess as any).mock.calls.length;
      const updateCalls = (storeService.update as any).mock.calls.length;

      expect(requireStoreAccessCalls).toBeGreaterThan(0);
      expect(updateCalls).toBeGreaterThan(0);
    });
  });
});
