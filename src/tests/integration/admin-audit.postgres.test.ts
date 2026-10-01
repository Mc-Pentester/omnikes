import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { _resetSecretCache, generateToken } from '@omnikes/lib/crypto';
import { GET } from '@omnikes/app/api/admin/audit/route';

describe('Administration audit runtime - PostgreSQL', () => {
  let adminId = '';
  let cashierId = '';
  let orgAId = '';
  let orgBId = '';

  const previousSessionSecret = process.env.SESSION_SECRET;

  beforeAll(async () => {
    process.env.SESSION_SECRET = 'p0-25-e-admin-audit-runtime-secret-0123456789';
    _resetSecretCache();
    const [admin, cashier, orgA, orgB] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: 'admin.a@omnikes.test' }, select: { id: true } }),
      prisma.user.findUniqueOrThrow({ where: { email: 'cashier.a@omnikes.test' }, select: { id: true } }),
      prisma.organization.findUniqueOrThrow({ where: { slug: 'omnikes-test-commerce-a' }, select: { id: true } }),
      prisma.organization.findUniqueOrThrow({ where: { slug: 'omnikes-test-commerce-b' }, select: { id: true } }),
    ]);
    adminId = admin.id;
    cashierId = cashier.id;
    orgAId = orgA.id;
    orgBId = orgB.id;
  });

  async function cookieFor(userId: string) {
    const token = generateToken();
    await sessionRepository.create({
      userId,
      token,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    });
    return `auth_token=${token}`;
  }

  afterAll(async () => {
    await prisma.$disconnect();
    if (previousSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = previousSessionSecret;
    }
    _resetSecretCache();
  });

  it('returns only audit events from the authenticated organization', async () => {
    const cookie = await cookieFor(adminId);
    const response = await GET(new NextRequest('http://localhost/api/admin/audit?take=100', {
      headers: { cookie },
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((item: { organizationId: string }) => item.organizationId === orgAId)).toBe(true);
    expect(body.items.some((item: { organizationId: string }) => item.organizationId === orgBId)).toBe(false);
  });

  it('denies CASHIER access', async () => {
    const cookie = await cookieFor(cashierId);
    const response = await GET(new NextRequest('http://localhost/api/admin/audit', {
      headers: { cookie },
    }));
    expect(response.status).toBe(403);
  });

  it('supports action and module filters without leaving the organization scope', async () => {
    const cookie = await cookieFor(adminId);
    const response = await GET(new NextRequest(
      'http://localhost/api/admin/audit?action=ORGANIZATION_UPDATED&module=organization&take=100',
      { headers: { cookie } },
    ));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.every((item: { organizationId: string; action: string; module: string }) =>
      item.organizationId === orgAId &&
      item.action === 'ORGANIZATION_UPDATED' &&
      item.module === 'organization',
    )).toBe(true);
  });
});
