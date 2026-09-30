import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hashToken, generateToken, _resetSecretCache } from '@omnikes/lib/crypto';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { prisma } from '@omnikes/lib/prisma';

// Mock Prisma client
vi.mock('@omnikes/lib/prisma', () => ({
  prisma: {
    session: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

describe('Session Security Tests - P0-24-A', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset secret cache and ensure test secret is set
    process.env.SESSION_SECRET = 'test-secret-for-vitest-environment-only-32chars';
    _resetSecretCache();
  });

  // TEST 1 — Création
  it('TEST 1 — Création: token brut généré et disponible temporairement, jamais persisté', async () => {
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);

    const mockSession = {
      id: 'session-1',
      userId: 'user-1',
      tokenHash,
      expiresAt: new Date(),
      createdAt: new Date(),
      user: {
        id: 'user-1',
        email: 'test@example.com',
        organization: { id: 'org-1', name: 'Test Org' },
      },
    };

    (prisma.session.create as any).mockResolvedValue(mockSession);

    const result = await sessionRepository.create({
      user: { connect: { id: 'user-1' } },
      expiresAt: new Date(),
    }, rawToken);

    // Verify raw token is returned (for cookie)
    expect(result.token).toBe(rawToken);

    // Verify Prisma create was called WITHOUT raw token
    const createCall = (prisma.session.create as any).mock.calls[0];
    expect(createCall[0].data.token).toBeUndefined();
    expect(createCall[0].data.tokenHash).toBe(tokenHash);
  });

  // TEST 2 — Aucun token brut persisté
  it('TEST 2 — Aucun token brut persisté: Prisma ne reçoit jamais token dans session.create', async () => {
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);

    (prisma.session.create as any).mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      tokenHash,
      expiresAt: new Date(),
      createdAt: new Date(),
      user: { id: 'user-1', email: 'test@example.com', organization: { id: 'org-1', name: 'Test Org' } },
    });

    await sessionRepository.create({
      user: { connect: { id: 'user-1' } },
      expiresAt: new Date(),
    }, rawToken);

    const createCall = (prisma.session.create as any).mock.calls[0];
    expect(createCall[0].data).not.toHaveProperty('token');
    expect(createCall[0].data).toHaveProperty('tokenHash');
  });

  // TEST 3 — Validation par tokenHash
  it('TEST 3 — Validation par tokenHash: recherche utilise tokenHash uniquement', async () => {
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);

    (prisma.session.findFirst as any).mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      tokenHash,
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
      createdAt: new Date(),
      user: { id: 'user-1', email: 'test@example.com', organization: { id: 'org-1', name: 'Test Org' } },
    });

    await sessionRepository.findValidByToken(rawToken);

    const findCall = (prisma.session.findFirst as any).mock.calls[0];
    expect(findCall[0].where).toEqual({ tokenHash });
    expect(findCall[0].where).not.toHaveProperty('token');
  });

  // TEST 4 — Ancien OR supprimé
  it('TEST 4 — Ancien OR supprimé: code ne fait plus OR token/tokenHash', async () => {
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);

    (prisma.session.findFirst as any).mockResolvedValue(null);

    await sessionRepository.findValidByToken(rawToken);

    const findCall = (prisma.session.findFirst as any).mock.calls[0];
    expect(findCall[0].where).not.toHaveProperty('OR');
  });

  // TEST 5 — Expiration
  it('TEST 5 — Expiration: session expirée refusée', async () => {
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);

    (prisma.session.findFirst as any).mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      tokenHash,
      expiresAt: new Date(Date.now() - 86400000), // Expired
      revokedAt: null,
      createdAt: new Date(),
      user: { id: 'user-1', email: 'test@example.com', organization: { id: 'org-1', name: 'Test Org' } },
    });

    const result = await sessionRepository.findValidByToken(rawToken);
    expect(result).toBeNull();
  });

  // TEST 6 — Révocation
  it('TEST 6 — Révocation: session avec revokedAt refusée', async () => {
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);

    (prisma.session.findFirst as any).mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      tokenHash,
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: new Date(), // Revoked
      createdAt: new Date(),
      user: { id: 'user-1', email: 'test@example.com', organization: { id: 'org-1', name: 'Test Org' } },
    });

    const result = await sessionRepository.findValidByToken(rawToken);
    expect(result).toBeNull();
  });

  // TEST 7 — Token inconnu
  it('TEST 7 — Token inconnu: token sans correspondance tokenHash refusé', async () => {
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);

    (prisma.session.findFirst as any).mockResolvedValue(null);

    const result = await sessionRepository.findValidByToken(rawToken);
    expect(result).toBeNull();
  });

  // TEST 8 — SESSION_SECRET absent
  it('TEST 8 — SESSION_SECRET absent: module échoue explicitement', () => {
    // Temporarily unset SESSION_SECRET
    const originalSecret = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;

    // Clear cached secret
    _resetSecretCache();

    expect(() => {
      hashToken('test-token');
    }).toThrow('SESSION_SECRET is required');

    // Restore
    process.env.SESSION_SECRET = originalSecret;
    _resetSecretCache();
  });

  // TEST 9 — SESSION_SECRET trop court
  it('TEST 9 — SESSION_SECRET trop court: secret < 32 octets refusé', () => {
    const originalSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'short';

    // Clear cached secret
    _resetSecretCache();

    expect(() => {
      hashToken('test-token');
    }).toThrow('SESSION_SECRET must be at least 32 characters long');

    // Restore
    process.env.SESSION_SECRET = originalSecret;
    _resetSecretCache();
  });

  // TEST 10 — SECRET placeholder interdit
  it('TEST 10 — SECRET placeholder interdit: valeurs par défaut refusées', () => {
    const originalSecret = process.env.SESSION_SECRET;
    const forbiddenSecrets = [
      'default-secret-change-in-production',
      'default-secret-change-me',
      'your-secret-key-here',
      'generate-with-openssl-rand-base64-32-change-in-production',
    ];

    for (const secret of forbiddenSecrets) {
      process.env.SESSION_SECRET = secret;
      _resetSecretCache();

      // Some placeholders are too short, so they fail length check first
      // That's acceptable - they're still rejected
      expect(() => {
        hashToken('test-token');
      }).toThrow();
    }

    // Restore
    process.env.SESSION_SECRET = originalSecret;
    _resetSecretCache();
  });

  // TEST 11 — SECRET valide
  it('TEST 11 — SECRET valide: secret de test >= 32 octets accepté', () => {
    const originalSecret = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'valid-test-secret-32-characters-long-123';

    // Clear cached secret
    _resetSecretCache();

    expect(() => {
      const hash = hashToken('test-token');
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64); // SHA-256 hex output
    }).not.toThrow();

    // Restore
    process.env.SESSION_SECRET = originalSecret;
    _resetSecretCache();
  });

  // TEST 12 — updateLastAccessed utilise tokenHash
  it('TEST 12 — updateLastAccessed: utilise tokenHash uniquement', async () => {
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);

    (prisma.session.updateMany as any).mockResolvedValue({ count: 1 });

    await sessionRepository.updateLastAccessed(rawToken);

    const updateCall = (prisma.session.updateMany as any).mock.calls[0];
    expect(updateCall[0].where).toEqual({ tokenHash });
    expect(updateCall[0].where).not.toHaveProperty('token');
  });

  // TEST 13 — revoke utilise tokenHash
  it('TEST 13 — revoke: utilise tokenHash uniquement', async () => {
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);

    (prisma.session.updateMany as any).mockResolvedValue({ count: 1 });

    await sessionRepository.revoke(rawToken);

    const updateCall = (prisma.session.updateMany as any).mock.calls[0];
    expect(updateCall[0].where).toEqual({ tokenHash });
    expect(updateCall[0].where).not.toHaveProperty('token');
  });

  // TEST 14 — findByToken utilise tokenHash
  it('TEST 14 — findByToken: utilise tokenHash uniquement', async () => {
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);

    (prisma.session.findFirst as any).mockResolvedValue(null);

    await sessionRepository.findByToken(rawToken);

    const findCall = (prisma.session.findFirst as any).mock.calls[0];
    expect(findCall[0].where).toEqual({ tokenHash });
    expect(findCall[0].where).not.toHaveProperty('token');
  });
});
