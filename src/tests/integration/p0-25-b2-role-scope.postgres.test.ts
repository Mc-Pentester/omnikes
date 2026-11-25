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

    const adminRoleA = byId.get('admin-role-a');
    const cashierRoleA = byId.get('cashier-role-a');
    const adminRoleB = byId.get('admin-role-b');

    expect(adminRoleA).toMatchObject({ isGlobal: true });
    expect(cashierRoleA).toMatchObject({ isGlobal: true });
    expect(adminRoleB).toMatchObject({ isGlobal: true });

    expect(adminRoleA?.organizationId).not.toBeNull();
    expect(cashierRoleA?.organizationId).toBe(adminRoleA?.organizationId);
    expect(adminRoleB?.organizationId).not.toBeNull();
    expect(adminRoleB?.organizationId).not.toBe(adminRoleA?.organizationId);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
