import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@omnikes/app/api/auth/change-password/route';

vi.mock('@omnikes/lib/auth', () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock('@omnikes/services/auth.service', () => ({
  authService: { changePassword: vi.fn() },
}));
vi.mock('@omnikes/lib/error-logger', () => ({ errorLogger: { auth: vi.fn() } }));

import { getAuthenticatedUser } from '@omnikes/lib/auth';
import { authService } from '@omnikes/services/auth.service';

const authenticatedUser = {
  id: 'user-123',
  email: 'cashier@example.test',
  name: 'Cashier',
  organizationId: 'org-123',
  organizationName: 'Test organization',
};

function request(body: unknown) {
  return new NextRequest('http://localhost/api/auth/change-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/change-password', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires an authenticated user', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    const response = await POST(request({
      currentPassword: 'current-password',
      newPassword: 'new-password-123',
      confirmPassword: 'new-password-123',
    }));
    expect(response.status).toBe(401);
    expect(authService.changePassword).not.toHaveBeenCalled();
  });

  it('rejects mismatched confirmation before changing the password', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(authenticatedUser);
    const response = await POST(request({
      currentPassword: 'current-password',
      newPassword: 'new-password-123',
      confirmPassword: 'different-password',
    }));
    expect(response.status).toBe(400);
    expect(authService.changePassword).not.toHaveBeenCalled();
  });

  it('rejects passwords shorter than eight characters', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(authenticatedUser);
    const response = await POST(request({
      currentPassword: 'current-password',
      newPassword: 'short',
      confirmPassword: 'short',
    }));
    expect(response.status).toBe(400);
    expect(authService.changePassword).not.toHaveBeenCalled();
  });

  it('changes the authenticated user password and clears the current cookie', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(authenticatedUser);
    vi.mocked(authService.changePassword).mockResolvedValue(undefined);
    const response = await POST(request({
      currentPassword: 'current-password',
      newPassword: 'new-password-123',
      confirmPassword: 'new-password-123',
    }));
    expect(response.status).toBe(200);
    expect(authService.changePassword).toHaveBeenCalledWith(
      authenticatedUser.id,
      'current-password',
      'new-password-123',
    );
    expect(response.headers.get('set-cookie')).toContain('auth_token=');
  });

  it('returns a safe validation error when the current password is wrong', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(authenticatedUser);
    vi.mocked(authService.changePassword).mockRejectedValue(new Error('Invalid current password'));
    const response = await POST(request({
      currentPassword: 'wrong-password',
      newPassword: 'new-password-123',
      confirmPassword: 'new-password-123',
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('incorrect');
  });
});
