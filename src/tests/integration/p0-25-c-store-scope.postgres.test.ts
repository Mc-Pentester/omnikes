import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { roleRepository } from '@omnikes/repositories/role.repository';

describe('P0-25-C - RBAC store scope organization boundary', () => {
  let adminAId = '';
  let orgAId = '';
  let orgBId = '';
  let storeAId = '';
  let storeBId = '';
  let scopedRoleId = '';
  let malformedRoleId = '';
  let scopedUserId = '';

  beforeAll(async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin.a@omnikes.test' },
      select: { id: true, organizationId: true },
    });

    const orgB = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'omnikes-test-commerce-b' },
      select: { id: true },
    });

    const storeA = await prisma.store.findFirstOrThrow({
      where: { organizationId: admin.organizationId },
      select: { id: true },
    });

    const storeB = await prisma.store.findFirstOrThrow({
      where: { organizationId: orgB.id },
      select: { id: true },
    });

    adminAId = admin.id;
    orgAId = admin.organizationId;
    orgBId = orgB.id;
    storeAId = storeA.id;
    storeBId = storeB.id;

    const suffix = Date.now().toString();

    const [scopedRole, malformedRole] = await Promise.all([
      prisma.role.create({
        data: {
          organizationId: orgAId,
          name: `P0-25-C-SCOPED-A-${suffix}`,
          isGlobal: false,
          storeId: storeAId,
        },
      }),
      prisma.role.create({
        data: {
          organizationId: orgAId,
          name: `P0-25-C-MALFORMED-CROSS-ORG-${suffix}`,
          isGlobal: false,
          storeId: storeBId,
        },
      }),
    ]);

    scopedRoleId = scopedRole.id;
    malformedRoleId = malformedRole.id;

    const scopedUser = await prisma.user.create({
      data: {
        email: `p0-25-c-${suffix}@omnikes.test`,
        name: 'P0-25-C Scoped User',
        password: 'test-hash',
        organizationId: orgAId,
      },
    });

    scopedUserId = scopedUser.id;

    await prisma.userRole.createMany({

      data: [
        { userId: scopedUserId, roleId: scopedRoleId },
        { userId: scopedUserId, roleId: malformedRoleId },
      ],
    });
  });

  it('returns only scoped stores belonging to the user organization', async () => {
    const authorizedStoreIds = await roleRepository.getAuthorizedStoreIds(scopedUserId);

    expect(authorizedStoreIds).not.toBeNull();
    expect(authorizedStoreIds).toContain(storeAId);
    expect(authorizedStoreIds).not.toContain(storeBId);
  });

  it('denies direct access to a store from another organization', async () => {
    expect(await roleRepository.canAccessStore(adminAId, storeAId)).toBe(true);
    expect(await roleRepository.canAccessStore(adminAId, storeBId)).toBe(false);
    expect(orgAId).not.toBe(orgBId);
  });

  afterAll(async () => {
    if (scopedUserId) {
      await prisma.user.delete({ where: { id: scopedUserId } });
    }

    await prisma.role.deleteMany({
      where: {
        id: { in: [scopedRoleId, malformedRoleId] },
      },
    });

    await prisma.$disconnect();
  });
});
