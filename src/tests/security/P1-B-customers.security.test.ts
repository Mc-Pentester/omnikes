import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const authMocks = vi.hoisted(() => ({
  requireCurrentOrganizationId: vi.fn(),
  requirePermission: vi.fn(),
}));

const repositoryMocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@omnikes/lib/auth', () => authMocks);
vi.mock('@omnikes/repositories/customer.repository', () => ({
  customerRepository: repositoryMocks,
}));

import { GET, PATCH, DELETE } from '@omnikes/app/api/customers/[id]/route';

const CUSTOMER_ID = 'ckxxxxxxxxxxxxxxxxxxxxxxx';
const MALFORMED_CUSTOMER_ID = 'not-a-cuid';

function request(method: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/customers/${CUSTOMER_ID}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
}

function params(id = CUSTOMER_ID) {
  return { params: Promise.resolve({ id }) };
}

describe('P1-B Customers API security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requireCurrentOrganizationId.mockResolvedValue('org-authorized');
    authMocks.requirePermission.mockResolvedValue(undefined);
    repositoryMocks.findById.mockResolvedValue({
      id: CUSTOMER_ID,
      organizationId: 'org-authorized',
      name: 'Client test',
      isActive: true,
    });
    repositoryMocks.update.mockResolvedValue({
      id: CUSTOMER_ID,
      organizationId: 'org-authorized',
      name: 'Client modifié',
      isActive: true,
    });
    repositoryMocks.delete.mockResolvedValue({
      id: CUSTOMER_ID,
      organizationId: 'org-authorized',
      name: 'Client test',
      isActive: false,
    });
  });

  it('GET: rejects unauthenticated requests with 401', async () => {
    authMocks.requireCurrentOrganizationId.mockRejectedValue(
      new Error('Authentication required')
    );

    const response = await GET(request('GET'), params());

    expect(response.status).toBe(401);
    expect(repositoryMocks.findById).not.toHaveBeenCalled();
  });

  it('GET: enforces customer.read before repository access', async () => {
    authMocks.requirePermission.mockRejectedValue(
      new Error('Permission required: customer.read')
    );

    const response = await GET(request('GET'), params());

    expect(response.status).toBe(403);
    expect(repositoryMocks.findById).not.toHaveBeenCalled();
    expect(authMocks.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      'customer.read'
    );
  });

  it('GET: enforces organization isolation', async () => {
    authMocks.requireCurrentOrganizationId.mockResolvedValue('org-a');

    await GET(request('GET'), params());

    expect(repositoryMocks.findById).toHaveBeenCalledWith(
      CUSTOMER_ID,
      'org-a'
    );
  });

  it('GET: hides a customer outside the organization as 404', async () => {
    repositoryMocks.findById.mockResolvedValue(null);

    const response = await GET(request('GET'), params());

    expect(response.status).toBe(404);
  });

  it('PATCH: requires customer.update and rejects empty updates', async () => {
    const response = await PATCH(request('PATCH', {}), params());

    expect(response.status).toBe(400);
    expect(authMocks.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      'customer.update'
    );
    expect(repositoryMocks.update).not.toHaveBeenCalled();
  });

  it('PATCH: rejects unknown fields (strict validation)', async () => {
    const response = await PATCH(
      request('PATCH', { name: 'X', organizationId: 'org-attacker' }),
      params()
    );

    expect(response.status).toBe(400);
    expect(repositoryMocks.update).not.toHaveBeenCalled();
  });

  it('PATCH: scopes repository update to the authenticated organization', async () => {
    await PATCH(request('PATCH', { name: 'Client modifié' }), params());

    expect(repositoryMocks.update).toHaveBeenCalledWith(
      CUSTOMER_ID,
      'org-authorized',
      { name: 'Client modifié' }
    );
  });

  it('PATCH: returns 404 when the repository cannot find the customer in that organization', async () => {
    repositoryMocks.update.mockResolvedValue(null);

    const response = await PATCH(
      request('PATCH', { name: 'Client modifié' }),
      params()
    );

    expect(response.status).toBe(404);
  });

  it('DELETE: requires customer.delete and uses scoped soft-delete', async () => {
    await DELETE(request('DELETE'), params());

    expect(authMocks.requirePermission).toHaveBeenCalledWith(
      expect.anything(),
      'customer.delete'
    );
    expect(repositoryMocks.delete).toHaveBeenCalledWith(
      CUSTOMER_ID,
      'org-authorized'
    );
  });

  it('DELETE: returns 404 when the customer is outside the organization or already inactive', async () => {
    repositoryMocks.delete.mockResolvedValue(null);

    const response = await DELETE(request('DELETE'), params());

    expect(response.status).toBe(404);
  });

  it('DELETE: exposes the soft-delete result without allowing organization override', async () => {
    const response = await DELETE(request('DELETE'), params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      customerId: CUSTOMER_ID,
      isActive: false,
    });
    expect(repositoryMocks.delete).not.toHaveBeenCalledWith(
      CUSTOMER_ID,
      expect.not.stringMatching(/^org-authorized$/)
    );
  });

  it('rejects malformed customer IDs before repository access', async () => {
    const response = await GET(
      request('GET'),
      params(MALFORMED_CUSTOMER_ID)
    );

    expect(response.status).toBe(400);
    expect(repositoryMocks.findById).not.toHaveBeenCalled();
  });
});
