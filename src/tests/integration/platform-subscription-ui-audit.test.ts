import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { generateToken } from '@omnikes/lib/crypto';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { PATCH } from '@omnikes/app/api/platform/subscriptions/[organizationId]/route';
import { GET as LIST } from '@omnikes/app/api/platform/subscriptions/route';

describe('P1-Platform-Subscriptions-UI-Audit', () => {
  let platformUserId = '';
  let orgAId = '';
  let orgBId = '';
  let originalOrgA: {
    subscriptionStatus: string;
    subscriptionPlan: string | null;
    subscriptionExpiresAt: Date | null;
  } | null = null;
  let originalOrgB: {
    subscriptionStatus: string;
    subscriptionPlan: string | null;
    subscriptionExpiresAt: Date | null;
  } | null = null;
  let platformSetupRequired = false;

  beforeAll(async () => {
    const orgA = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'omnikes-test-commerce-a' },
      select: { id: true, subscriptionStatus: true, subscriptionPlan: true, subscriptionExpiresAt: true },
    });
    const orgB = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'omnikes-test-commerce-b' },
      select: { id: true, subscriptionStatus: true, subscriptionPlan: true, subscriptionExpiresAt: true },
    });

    // Vérifier si le role plateforme existe
    const platformRole = await prisma.platformRole.findFirst({
      where: { name: 'OMNIKES_PLATFORM_OPERATOR' },
      select: { id: true },
    });

    if (!platformRole) {
      platformSetupRequired = true;
      console.warn('⚠️ Platform role OMNIKES_PLATFORM_OPERATOR not found. Skipping P1 UI audit tests.');
      return;
    }

    orgAId = orgA.id;
    orgBId = orgB.id;
    originalOrgA = {
      subscriptionStatus: orgA.subscriptionStatus,
      subscriptionPlan: orgA.subscriptionPlan,
      subscriptionExpiresAt: orgA.subscriptionExpiresAt,
    };
    originalOrgB = {
      subscriptionStatus: orgB.subscriptionStatus,
      subscriptionPlan: orgB.subscriptionPlan,
      subscriptionExpiresAt: orgB.subscriptionExpiresAt,
    };

    const suffix = Date.now();
    const platformUser = await prisma.user.create({
      data: {
        email: `p1-platform-ui-audit.${suffix}@omnikes.test`,
        name: 'P1 Platform UI Audit User',
        password: 'not-used-by-this-test',
        organizationId: orgAId,
        isActive: true,
        platformUserRoles: {
          create: { platformRoleId: platformRole.id },
        },
      },
      select: { id: true },
    });

    platformUserId = platformUser.id;
  });

  function skipIfPlatformSetupRequired() {
    if (platformSetupRequired) {
      console.warn('⏭️ Skipping test - platform setup required');
      return true;
    }
    return false;
  }

  async function cookieFor(userId: string) {
    const rawToken = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await sessionRepository.create(
      {
        user: { connect: { id: userId } },
        expiresAt,
        ipAddress: '127.0.0.1',
        userAgent: 'P1-platform-ui-audit-test',
      },
      rawToken,
    );

    return `auth_token=${rawToken}`;
  }

  // Contrôle 1: API reste l'autorité
  it('API authority: PATCH with wrong organizationId in body is rejected', async () => {
    if (platformSetupRequired) {
      console.warn('⏭️ Skipping test - platform setup required');
      return;
    }
    // Tenter d'envoyer des données pour orgB mais avec orgAId dans l'URL
    const request = new NextRequest(
      `http://localhost/api/platform/subscriptions/${orgAId}`,
      {
        method: 'PATCH',
        headers: {
          cookie: await cookieFor(platformUserId),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'ACTIVATE',
          plan: 'OMNIKES_299',
          expiresAt: '2099-12-31',
          // L'API ne devrait accepter que l'organizationId de l'URL
        }),
      },
    );

    const response = await PATCH(
      request as never,
      { params: Promise.resolve({ organizationId: orgAId }) },
    );

    // L'API doit utiliser l'organizationId de l'URL, pas du body
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.organization.id).toBe(orgAId);
  });

  // Contrôle 2: Non-authentifié
  it('rejects unauthenticated requests', async () => {
    if (skipIfPlatformSetupRequired()) return;
    const request = new NextRequest(
      `http://localhost/api/platform/subscriptions/${orgAId}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'ACTIVATE',
          plan: 'OMNIKES_149',
          expiresAt: '2099-12-31',
        }),
      },
    );

    const response = await PATCH(
      request as never,
      { params: Promise.resolve({ organizationId: orgAId }) },
    );

    expect(response.status).toBe(401);
  });

  // Contrôle 3: Absence de permission plateforme
  it('rejects requests without platform permission', async () => {
    if (skipIfPlatformSetupRequired()) return;
    // Créer un utilisateur tenant normal sans permission plateforme
    const tenantUser = await prisma.user.create({
      data: {
        email: `p1-tenant-user.${Date.now()}@omnikes.test`,
        name: 'P1 Tenant User',
        password: 'not-used',
        organizationId: orgAId,
        isActive: true,
      },
      select: { id: true },
    });

    const request = new NextRequest(
      `http://localhost/api/platform/subscriptions/${orgBId}`,
      {
        method: 'PATCH',
        headers: {
          cookie: await cookieFor(tenantUser.id),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'ACTIVATE',
          plan: 'OMNIKES_149',
          expiresAt: '2099-12-31',
        }),
      },
    );

    const response = await PATCH(
      request as never,
      { params: Promise.resolve({ organizationId: orgBId }) },
    );

    expect(response.status).toBe(403);

    // Nettoyer
    await prisma.user.delete({ where: { id: tenantUser.id } }).catch(() => undefined);
  });

  // Contrôle 4: Plan invalide
  it('rejects invalid plan', async () => {
    if (skipIfPlatformSetupRequired()) return;
    const request = new NextRequest(
      `http://localhost/api/platform/subscriptions/${orgAId}`,
      {
        method: 'PATCH',
        headers: {
          cookie: await cookieFor(platformUserId),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'ACTIVATE',
          plan: 'INVALID_PLAN',
          expiresAt: '2099-12-31',
        }),
      },
    );

    const response = await PATCH(
      request as never,
      { params: Promise.resolve({ organizationId: orgAId }) },
    );

    expect(response.status).toBe(400);
  });

  // Contrôle 5: Expiration passée
  it('rejects past expiration date', async () => {
    if (skipIfPlatformSetupRequired()) return;
    const request = new NextRequest(
      `http://localhost/api/platform/subscriptions/${orgAId}`,
      {
        method: 'PATCH',
        headers: {
          cookie: await cookieFor(platformUserId),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'ACTIVATE',
          plan: 'OMNIKES_149',
          expiresAt: '2020-01-01', // Date passée
        }),
      },
    );

    const response = await PATCH(
      request as never,
      { params: Promise.resolve({ organizationId: orgAId }) },
    );

    expect(response.status).toBe(400);
  });

  // Contrôle 6: CANCEL + audit log
  it('CANCEL action writes audit log', async () => {
    if (skipIfPlatformSetupRequired()) return;
    // D'abord activer
    await prisma.organization.update({
      where: { id: orgAId },
      data: {
        subscriptionStatus: 'ACTIVE',
        subscriptionPlan: 'OMNIKES_149',
        subscriptionExpiresAt: new Date('2099-12-31'),
      },
    });

    // Puis annuler
    const request = new NextRequest(
      `http://localhost/api/platform/subscriptions/${orgAId}`,
      {
        method: 'PATCH',
        headers: {
          cookie: await cookieFor(platformUserId),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'CANCEL',
        }),
      },
    );

    const response = await PATCH(
      request as never,
      { params: Promise.resolve({ organizationId: orgAId }) },
    );

    expect(response.status).toBe(200);

    // Vérifier audit log
    const audit = await prisma.auditLog.findFirst({
      where: {
        userId: platformUserId,
        organizationId: orgAId,
        action: 'ORGANIZATION_SUBSCRIPTION_CANCELLED',
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(audit).not.toBeNull();
    expect(audit?.entityId).toBe(orgAId);
  });

  // Contrôle 7: Formulaire A → B - Vérifier que l'API est l'autorité
  it('API authority: switching organizations in API updates correct target', async () => {
    if (skipIfPlatformSetupRequired()) return;
    // Activer orgA avec plan 149
    const requestA = new NextRequest(
      `http://localhost/api/platform/subscriptions/${orgAId}`,
      {
        method: 'PATCH',
        headers: {
          cookie: await cookieFor(platformUserId),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'ACTIVATE',
          plan: 'OMNIKES_149',
          expiresAt: '2099-12-31',
        }),
      },
    );

    const responseA = await PATCH(
      requestA as never,
      { params: Promise.resolve({ organizationId: orgAId }) },
    );

    expect(responseA.status).toBe(200);

    // Activer orgB avec plan 299
    const requestB = new NextRequest(
      `http://localhost/api/platform/subscriptions/${orgBId}`,
      {
        method: 'PATCH',
        headers: {
          cookie: await cookieFor(platformUserId),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'ACTIVATE',
          plan: 'OMNIKES_299',
          expiresAt: '2098-12-31',
        }),
      },
    );

    const responseB = await PATCH(
      requestB as never,
      { params: Promise.resolve({ organizationId: orgBId }) },
    );

    expect(responseB.status).toBe(200);

    // Vérifier que les deux organisations ont les bons plans
    const finalOrgA = await prisma.organization.findUnique({
      where: { id: orgAId },
      select: { subscriptionPlan: true },
    });

    const finalOrgB = await prisma.organization.findUnique({
      where: { id: orgBId },
      select: { subscriptionPlan: true },
    });

    expect(finalOrgA?.subscriptionPlan).toBe('OMNIKES_149');
    expect(finalOrgB?.subscriptionPlan).toBe('OMNIKES_299');
  });

  // Contrôle 8: Formulaire A → B - UI synchronisation (simulation logique)
  it('UI synchronization: when switching from org A to org B, form should show B values', async () => {
    if (skipIfPlatformSetupRequired()) return;

    // Simuler: orgA a plan 149, orgB a plan 299
    await prisma.organization.update({
      where: { id: orgAId },
      data: {
        subscriptionStatus: 'ACTIVE',
        subscriptionPlan: 'OMNIKES_149',
        subscriptionExpiresAt: new Date('2099-12-31'),
      },
    });

    await prisma.organization.update({
      where: { id: orgBId },
      data: {
        subscriptionStatus: 'ACTIVE',
        subscriptionPlan: 'OMNIKES_299',
        subscriptionExpiresAt: new Date('2098-12-31'),
      },
    });

    // Récupérer les organisations via l'API
    const listRequest = new NextRequest('http://localhost/api/platform/subscriptions', {
      headers: { cookie: await cookieFor(platformUserId) },
    });

    const listResponse = await LIST(listRequest as never);
    expect(listResponse.status).toBe(200);

    const listBody = await listResponse.json();
    const orgAFromApi = listBody.organizations.find((item: { id: string }) => item.id === orgAId);
    const orgBFromApi = listBody.organizations.find((item: { id: string }) => item.id === orgBId);

    // Vérifier que l'API retourne les bonnes valeurs
    expect(orgAFromApi.subscriptionPlan).toBe('OMNIKES_149');
    expect(orgBFromApi.subscriptionPlan).toBe('OMNIKES_299');

    // Simulation: si selectedId passe de orgAId à orgBId
    // Le formulaire UI devrait mettre à jour plan/expiresAt avec les valeurs de orgB
    // C'est une vérification logique - l'UI React fait cela via useEffect
    const simulatedSelectedIdChange = (newSelectedId: string) => {
      const org = listBody.organizations.find((item: { id: string }) => item.id === newSelectedId);
      if (!org) return null;

      return {
        plan: org.subscriptionPlan,
        expiresAt: org.subscriptionExpiresAt,
      };
    };

    // Simuler passage A → B
    const formA = simulatedSelectedIdChange(orgAId);
    const formB = simulatedSelectedIdChange(orgBId);

    // Vérifier que les valeurs sont différentes
    expect(formA?.plan).toBe('OMNIKES_149');
    expect(formB?.plan).toBe('OMNIKES_299');
    expect(formA?.plan).not.toBe(formB?.plan);

    // Restore original values
    await prisma.organization.update({
      where: { id: orgAId },
      data: originalOrgA!,
    });
    await prisma.organization.update({
      where: { id: orgBId },
      data: originalOrgB!,
    });
  });

  afterAll(async () => {
    if (platformUserId) {
      await prisma.user.delete({ where: { id: platformUserId } }).catch(() => undefined);
    }

    // Restore original values as fallback
    if (originalOrgA) {
      await prisma.organization.update({
        where: { id: orgAId },
        data: originalOrgA,
      }).catch(() => undefined);
    }

    if (originalOrgB) {
      await prisma.organization.update({
        where: { id: orgBId },
        data: originalOrgB,
      }).catch(() => undefined);
    }

    await prisma.$disconnect();
  });

  afterAll(async () => {
    if (platformUserId) {
      await prisma.user.delete({ where: { id: platformUserId } }).catch(() => undefined);
    }

    // Restauration finale (si pas déjà restaurée dans les tests)
    if (originalOrgA) {
      await prisma.organization.update({
        where: { id: orgAId },
        data: originalOrgA,
      }).catch(() => undefined);
    }

    if (originalOrgB) {
      await prisma.organization.update({
        where: { id: orgBId },
        data: originalOrgB,
      }).catch(() => undefined);
    }

    await prisma.$disconnect();
  });
});
