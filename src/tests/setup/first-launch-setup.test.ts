import { describe, expect, it, vi } from 'vitest';

const organizationCount = vi.fn();

vi.mock('@omnikes/lib/prisma', () => ({
  prisma: {
    organization: {
      count: organizationCount,
    },
  },
}));

describe('First-launch setup status', () => {
  it('reports an unconfigured installation when no organization exists', async () => {
    organizationCount.mockResolvedValueOnce(0);
    const { GET } = await import('@omnikes/app/api/setup/status/route');

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ configured: false });
  });

  it('reports a configured installation when an organization exists', async () => {
    organizationCount.mockResolvedValueOnce(1);
    const { GET } = await import('@omnikes/app/api/setup/status/route');

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ configured: true });
  });

  it('returns JSON on database status failure', async () => {
    organizationCount.mockRejectedValueOnce(new Error('database unavailable'));
    const { GET } = await import('@omnikes/app/api/setup/status/route');

    const response = await GET();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Unable to determine installation status',
    });
  });
});
