import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';

describe('P0-25-B.2 - global role organization scope', () => {
  it('requires every assigned global role to have one organization scope', async () => {
    const assignedGlobalRoles = await prisma.role.findMany({
      where: {
        isGlobal: true,
        userRoles: {
          some: {},
        },
      },
      select: {
        id: true,
        name: true,
        organizationId: true,
        userRoles: {
          select: {
            user: {
              select: {
                organizationId: true,
              },
            },
          },
        },
      },
    });

    for (const role of assignedGlobalRoles) {
      expect(role.organizationId, `global role ${role.id} must be organization-scoped`).not.toBeNull();

      const organizations = new Set(
        role.userRoles.map((userRole) => userRole.user.organizationId),
      );

      expect(
        organizations.size,
        `global role ${role.id} must not cross organization boundaries`,
      ).toBe(1);

      expect([...organizations][0]).toBe(role.organizationId);
    }
  });

  it('keeps the seeded global roles scoped to their organizations', async () => {
    const roles = await prisma.role.findMany({
      where: {
        id: {
          in: ['admin-role-a', 'cashier-role-a', 'admin-role-b'],
        },
      },
      select: {
        id: true,
        isGlobal: true,
        organizationId: true,
      },
      orderBy: { id: 'asc' },
    });

    expect(roles).toHaveLength(3);

    const byId = new Map(roles.map((role) => [role.id, role]));

    expect(byId.get('admin-role-a')).toMatchObject({
      isGlobal: true,
      organizationId: 'cmu8gsgwp0000fgqr0uckya14',
    });

    expect(byId.get('cashier-role-a')).toMatchObject({
      isGlobal: true,
      organizationId: 'cmu8gsgwp0000fgqr0uckya14',
    });

    expect(byId.get('admin-role-b')).toMatchObject({
      isGlobal: true,
      organizationId: 'cmu8gsgx00001fgqrledvbouk',
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
