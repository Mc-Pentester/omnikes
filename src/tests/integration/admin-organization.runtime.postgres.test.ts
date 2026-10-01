import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { generateToken } from '@omnikes/lib/crypto';
import { GET, PATCH } from '@omnikes/app/api/admin/organization/route';

describe('P0-25-D.3 - real PostgreSQL organization runtime proof', () => {
  let adminId = '';
  let cashierId = '';
  let orgAId = '';
  let orgBId = '';
  let originalName = '';
  let originalCountry = '';
  let originalCurrency = '';
  let originalLocale = '';
  let originalTimezone = '';
  let originalCloudEnabled = false;
  let originalOnlineStoreEnabled = false;

  beforeAll(async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin.a@omnikes.test' },
      select: { id: true, organizationId: true },
    });
    const cashier = await prisma.user.findUniqueOrThrow({
      where: { email: 'cashier.a@omnikes.test' },
      select: { id: true },
    });
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: admin.organizationId },
      select: {
        id: true,
        name: true,
        country: true,
        currency: true,
        locale: true,
        timezone: true,
        cloudEnabled: true,
        onlineStoreEnabled: true,
      },
    });
    const orgB = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'omnikes-test-commerce-b' },
      select: { id: true },
    });

    adminId = admin.id;
    cashierId = cashier.id;
    orgAId = org.id;
    orgBId = orgB.id;
    originalName = org.name;
    originalCountry = org.country;
    originalCurrency = org.currency;
    originalLocale = org.locale;
    originalTimezone = org.timezone;
    originalCloudEnabled = org.cloudEnabled;
    originalOnlineStoreEnabled = org.onlineStoreEnabled;
  });

  async function cookieFor(userId: string) {
    const rawToken = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await sessionRepository.create(
      {
        user: { connect: { id: userId } },
        expiresAt,
        ipAddress: '127.0.0.1',
        userAgent: 'P0-25-D3-organization-runtime-test',
      },
      rawToken,
    );

    return `auth_token=${rawToken}`;
  }

  it('GET returns only the organization bound to the authenticated session', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/admin/organization', {
        headers: { cookie: await cookieFor(adminId) },
      }) as never,
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.organization.id).toBe(orgAId);
    expect(body.organization.id).not.toBe(orgBId);
    expect(body.organization).not.toHaveProperty('users');
    expect(body.organization).not.toHaveProperty('organizationId');
  });

  it('CASHIER cannot read or modify organization settings', async () => {
    const cookie = await cookieFor(cashierId);

    const getResponse = await GET(
      new NextRequest('http://localhost/api/admin/organization', {
        headers: { cookie },
      }) as never,
    );
    expect(getResponse.status).toBe(403);

    const patchResponse = await PATCH(
      new NextRequest('http://localhost/api/admin/organization', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Unauthorized runtime change' }),
      }) as never,
    );
    expect(patchResponse.status).toBe(403);
  });

  it('persists all editable settings and records the audit event', async () => {
    const cookie = await cookieFor(adminId);
    const newName = `OmniKès D3 Runtime ${Date.now()}`;

    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/organization', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          country: 'ht',
          currency: 'htg',
          locale: 'fr-HT',
          timezone: 'America/Port-au-Prince',
          cloudEnabled: true,
          onlineStoreEnabled: true,
        }),
      }) as never,
    );

    expect(response.status).toBe(200);

    const persisted = await prisma.organization.findUniqueOrThrow({
      where: { id: orgAId },
    });

    expect(persisted.name).toBe(newName);
    expect(persisted.country).toBe('HT');
    expect(persisted.currency).toBe('HTG');
    expect(persisted.locale).toBe('fr-HT');
    expect(persisted.timezone).toBe('America/Port-au-Prince');
    expect(persisted.cloudEnabled).toBe(true);
    expect(persisted.onlineStoreEnabled).toBe(true);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        organizationId: orgAId,
        userId: adminId,
        action: 'ORGANIZATION_UPDATED',
        entityId: orgAId,
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(audit.entityType).toBe('Organization');
    expect(audit.module).toBe('organization');
    expect(audit.oldValues).toBeTruthy();
    expect(audit.newValues).toBeTruthy();
  });

  it('cannot modify slug, organization id, or another organization through the API payload', async () => {
    const before = await prisma.organization.findUniqueOrThrow({
      where: { id: orgAId },
      select: { id: true, slug: true, name: true },
    });
    const orgB = await prisma.organization.findUniqueOrThrow({
      where: { id: orgBId },
      select: { name: true, slug: true },
    });

    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/organization', {
        method: 'PATCH',
        headers: {
          cookie: await cookieFor(adminId),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: orgBId,
          id: orgBId,
          slug: 'attempted-cross-org-slug',
          name: 'Authorized D3 change',
        }),
      }) as never,
    );

    expect(response.status).toBe(200);

    const after = await prisma.organization.findUniqueOrThrow({
      where: { id: orgAId },
      select: { id: true, slug: true, name: true },
    });
    const otherOrg = await prisma.organization.findUniqueOrThrow({
      where: { id: orgBId },
      select: { name: true, slug: true },
    });

    expect(after.id).toBe(before.id);
    expect(after.slug).toBe(before.slug);
    expect(after.name).toBe('Authorized D3 change');
    expect(otherOrg.name).toBe(orgB.name);
    expect(otherOrg.slug).toBe(orgB.slug);
  });

  it('rejects an invalid timezone without persisting it', async () => {
    const before = await prisma.organization.findUniqueOrThrow({
      where: { id: orgAId },
      select: { timezone: true },
    });

    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/organization', {
        method: 'PATCH',
        headers: {
          cookie: await cookieFor(adminId),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ timezone: 'Not/A-Timezone' }),
      }) as never,
    );

    expect(response.status).toBe(400);

    const after = await prisma.organization.findUniqueOrThrow({
      where: { id: orgAId },
      select: { timezone: true },
    });
    expect(after.timezone).toBe(before.timezone);
  });

  afterAll(async () => {
    await prisma.organization.update({
      where: { id: orgAId },
      data: {
        name: originalName,
        country: originalCountry,
        currency: originalCurrency,
        locale: originalLocale,
        timezone: originalTimezone,
        cloudEnabled: originalCloudEnabled,
        onlineStoreEnabled: originalOnlineStoreEnabled,
      },
    });
    await prisma.$disconnect();
  });
});
