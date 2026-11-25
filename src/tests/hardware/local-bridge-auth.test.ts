import { describe, expect, it, vi } from 'vitest';

describe('LocalHardwareBridgeClient authentication', () => {
  it('sends the bridge bearer token on requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { LocalHardwareBridgeClient } = await import('@omnikes/lib/hardware/local-bridge');
    const client = new LocalHardwareBridgeClient({
      token: 'a'.repeat(32),
    });

    await client.health();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    expect(new Headers(requestInit?.headers).get('Authorization')).toBe(
      'Bearer ' + 'a'.repeat(32),
    );
  });
});
