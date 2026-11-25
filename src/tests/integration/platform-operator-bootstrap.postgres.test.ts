import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { authService } from '@omnikes/services/auth.service';
import { platformRoleRepository } from '@omnikes/repositories/platform-role.repository';
import {
  PLATFORM_OPERATOR_ROLE,
  platformOperatorBootstrapService,
} from '@omnikes/services/platform-operator-bootstrap.service';

describe('P0 - explicit first platform operator bootstrap', () => {
  const suffix = Date.now().toString();
  let organizationId = '';
  let userId = '';

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: {
        name: `Bootstrap Test ${suffix}`,
        slug: `bootstrap-test-${suffix}`,
        country: 'HT',
        currency: 'HTG',
        locale: 'fr-HT',
        timezone: 'America/Port-au-Prince',
      },
      select: { id: true },
    });

    organizationId = organization.id;
  });

  it('creates exactly one platform operator without tenant role elevation', async () => {
    const result = await platformOperatorBootstrapService.bootstrap({
      organizationId,
      email: `bootstrap.operator.${suffix}@omnikes.test`,
      name: 'Bootstrap Platform Operator',
      password: 'BootstrapTest!2026',
    });

    userId = result.userId;

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        userRoles: true,
        platformUserRoles: {
          include: { platformRole: true },
        },
      },
    });

    expect(user.organizationId).toBe(organizationId);
    expect(user.userRoles).toHaveLength(0);
    expect(user.platformUserRoles).toHaveLength(1);
    expect(user.platformUserRoles[0].platformRole.name).toBe(PLATFORM_OPERATOR_ROLE);
    expect(await platformRoleRepository.hasPermission(userId, 'organization.subscription.manage')).toBe(true);
  });

  it('uses the normal authentication password/session mechanism', async () => {
    const result = await authService.login(
      `bootstrap.operator.${suffix}@omnikes.test`,
      'BootstrapTest!2026',
      '127.0.0.1',
      'P0-bootstrap-test',
    );

    expect(result.user.id).toBe(userId);
    expect(result.user.organizationId).toBe(organizationId);

    await authService.logout(result.token);
  });

  it('rejects a second bootstrap after the first active operator exists', async () => {
    await expect(
      platformOperatorBootstrapService.bootstrap({
        organizationId,
        email: `second.bootstrap.${suffix}@omnikes.test`,
        name: 'Second Bootstrap Operator',
        password: 'BootstrapTest!2026',
      }),
    ).rejects.toThrow('Platform operator bootstrap has already been completed');

    const activeOperators = await prisma.platformUserRole.count({
      where: {
        platformRole: {
          name: PLATFORM_OPERATOR_ROLE,
          isActive: true,
        },
        user: {
          isActive: true,
        },
      },
    });

    expect(activeOperators).toBeGreaterThanOrEqual(1);

    const secondUser = await prisma.user.findUnique({
      where: { email: `second.bootstrap.${suffix}@omnikes.test` },
      select: { id: true },
    });
    expect(secondUser).toBeNull();
  });

  it('writes a PLATFORM-scoped bootstrap audit event', async () => {
    const audit = await prisma.auditLog.findFirst({
      where: {
        userId,
        action: 'PLATFORM_OPERATOR_BOOTSTRAPPED',
      },
      orderBy: { createdAt: 'desc' },
      select: { organizationId: true, entityId: true, metadata: true },
    });

    expect(audit).toEqual({
      organizationId,
      entityId: userId,
      metadata: {
        authorizationScope: 'PLATFORM',
        role: PLATFORM_OPERATOR_ROLE,
        bootstrap: true,
      },
    });
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });
});
