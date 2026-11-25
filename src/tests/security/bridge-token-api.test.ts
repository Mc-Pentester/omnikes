import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@omnikes/lib/auth', () => ({
  requireCurrentOrganizationId: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock('@omnikes/lib/hardware/bridge-token', () => ({
  issueHardwareBridgeToken: vi.fn(() => 'v1.ephemeral-signed-token'),
}));

import {
  requireCurrentOrganizationId,
  requirePermission,
} from '@omnikes/lib/auth';
import { issueHardwareBridgeToken } from '@omnikes/lib/hardware/bridge-token';
import { GET } from '@omnikes/app/api/hardware/bridge-token/route';

describe('P2-S1 hardware bridge token API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN = 'test-master-secret-for-omnikes-bridge-0123456789';
    (requireCurrentOrganizationId as any).mockResolvedValue('org-a');
    (requirePermission as any).mockResolvedValue(undefined);
  });

  it('returns 401 without authentication', async () => {
    (requireCurrentOrganizationId as any).mockRejectedValue(new Error('Authentication required'));

    const response = await GET(new NextRequest('http://localhost/api/hardware/bridge-token'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Authentication required' });
    expect(issueHardwareBridgeToken).not.toHaveBeenCalled();
  });

  it('returns 403 without hardware.bridge.read', async () => {
    (requirePermission as any).mockRejectedValue(new Error('Permission required: hardware.bridge.read'));

    const response = await GET(new NextRequest('http://localhost/api/hardware/bridge-token'));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Permission required' });
    expect(issueHardwareBridgeToken).not.toHaveBeenCalled();
  });

  it('returns only an ephemeral token and never the master secret', async () => {
    const response = await GET(new NextRequest('http://localhost/api/hardware/bridge-token'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ token: 'v1.ephemeral-signed-token', expiresIn: 300 });
    expect(JSON.stringify(body)).not.toContain(process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(issueHardwareBridgeToken).toHaveBeenCalledWith('org-a');
  });

  it('returns 503 when the bridge master secret is not configured', async () => {
    delete process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN;

    const response = await GET(new NextRequest('http://localhost/api/hardware/bridge-token'));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Hardware bridge authentication is not configured',
    });
  });
});
