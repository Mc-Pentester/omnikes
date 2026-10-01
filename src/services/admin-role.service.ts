import { Prisma } from '@prisma/client';
import { prisma } from '@omnikes/lib/prisma';
import { roleRepository } from '@omnikes/repositories/role.repository';
import {
  adminRoleCreateSchema,
  adminRoleUpdateSchema,
  AdminRoleCreateInput,
  AdminRoleUpdateInput,
} from '@omnikes/lib/validation';

export class AdminRoleService {
  private async assertStoreScope(organizationId: string, isGlobal: boolean, storeId: string | null | undefined) {
    if (isGlobal) {
      if (storeId) throw new Error('Global role cannot be assigned to a store');
      return;
    }

    if (!storeId) throw new Error('Store-scoped role requires a store');

    const store = await prisma.store.findFirst({
      where: { id: storeId, organizationId, isActive: true },
      select: { id: true },
    });
    if (!store) throw new Error('Store not found or inactive');
  }

  private async assertPermissionsCanBeDelegated(actorUserId: string, permissionIds: string[]) {
    if (!permissionIds.length) return;

    const actorRoles = await roleRepository.getUserRoles(actorUserId);
    const actorPermissions = new Set(actorRoles.flatMap((role) => role.permissions));

    const permissions = await prisma.permission.findMany({
      where: { id: { in: permissionIds } },
      select: { id: true, code: true },
    });

    if (permissions.length !== permissionIds.length) {
      throw new Error('One or more permissions do not exist');
    }

    const unauthorized = permissions.filter((permission) => !actorPermissions.has(permission.code));
    if (unauthorized.length) {
      throw new Error('You cannot delegate a permission you do not possess');
    }

    return permissions;
  }

  async list(organizationId: string) {
    const [roles, permissions, stores] = await Promise.all([
      prisma.role.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          description: true,
          isGlobal: true,
          storeId: true,
          createdAt: true,
          updatedAt: true,
          rolePermissions: {
            select: {
              permission: { select: { id: true, code: true, description: true, module: true } },
            },
          },
          _count: { select: { userRoles: true } },
        },
        orderBy: [{ isGlobal: 'desc' }, { name: 'asc' }, { storeId: 'asc' }],
      }),
      prisma.permission.findMany({
        select: { id: true, code: true, description: true, module: true },
        orderBy: [{ module: 'asc' }, { code: 'asc' }],
      }),
      prisma.store.findMany({
        where: { organizationId },
        select: { id: true, name: true, code: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      roles: roles.map((role) => ({
        ...role,
        permissions: role.rolePermissions.map((item) => item.permission),
        userCount: role._count.userRoles,
      })),
      permissions,
      stores,
    };
  }

  async create(organizationId: string, input: AdminRoleCreateInput, actorUserId: string) {
    const data = adminRoleCreateSchema.parse(input);
    await this.assertStoreScope(organizationId, data.isGlobal, data.storeId);
    await this.assertPermissionsCanBeDelegated(actorUserId, data.permissionIds);

    const existing = await prisma.role.findFirst({
      where: {
        organizationId,
        name: data.name,
        isGlobal: data.isGlobal,
        storeId: data.storeId ?? null,
      },
      select: { id: true },
    });
    if (existing) throw new Error('A role with this name and scope already exists');

    return prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          organizationId,
          name: data.name,
          description: data.description || null,
          isGlobal: data.isGlobal,
          storeId: data.isGlobal ? null : data.storeId,
        },
        select: {
          id: true,
          name: true,
          description: true,
          isGlobal: true,
          storeId: true,
        },
      });

      if (data.permissionIds.length) {
        await tx.rolePermission.createMany({
          data: data.permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actorUserId,
          organizationId,
          action: 'ROLE_CREATED',
          module: 'roles',
          entityId: role.id,
          entityType: 'Role',
          newValues: {
            name: role.name,
            description: role.description,
            isGlobal: role.isGlobal,
            storeId: role.storeId,
            permissionIds: data.permissionIds,
          },
        },
      });

      return role;
    });
  }

  async update(
    organizationId: string,
    roleId: string,
    input: AdminRoleUpdateInput,
    actorUserId: string,
  ) {
    const data = adminRoleUpdateSchema.parse(input);
    const current = await prisma.role.findFirst({
      where: { id: roleId, organizationId },
      include: {
        rolePermissions: { select: { permissionId: true } },
      },
    });
    if (!current) throw new Error('Role not found');

    const nextIsGlobal = data.isGlobal ?? current.isGlobal;
    const nextStoreId = data.isGlobal === true
      ? null
      : data.storeId !== undefined
        ? data.storeId
        : current.storeId;

    await this.assertStoreScope(organizationId, nextIsGlobal, nextStoreId);

    const nextPermissionIds = data.permissionIds ?? current.rolePermissions.map((item) => item.permissionId);
    await this.assertPermissionsCanBeDelegated(actorUserId, nextPermissionIds);

    if (data.name !== undefined || data.isGlobal !== undefined || data.storeId !== undefined) {
      const existing = await prisma.role.findFirst({
        where: {
          organizationId,
          name: data.name ?? current.name,
          isGlobal: nextIsGlobal,
          storeId: nextStoreId,
          NOT: { id: roleId },
        },
        select: { id: true },
      });
      if (existing) throw new Error('A role with this name and scope already exists');
    }

    return prisma.$transaction(async (tx) => {
      const role = await tx.role.update({
        where: { id: roleId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description || null } : {}),
          isGlobal: nextIsGlobal,
          storeId: nextStoreId,
        },
        select: {
          id: true,
          name: true,
          description: true,
          isGlobal: true,
          storeId: true,
        },
      });

      if (data.permissionIds !== undefined) {
        await tx.rolePermission.deleteMany({ where: { roleId } });
        if (data.permissionIds.length) {
          await tx.rolePermission.createMany({
            data: data.permissionIds.map((permissionId) => ({ roleId, permissionId })),
            skipDuplicates: true,
          });
        }
      }

      await tx.auditLog.create({
        data: {
          userId: actorUserId,
          organizationId,
          action: 'ROLE_UPDATED',
          module: 'roles',
          entityId: role.id,
          entityType: 'Role',
          oldValues: {
            name: current.name,
            description: current.description,
            isGlobal: current.isGlobal,
            storeId: current.storeId,
            permissionIds: current.rolePermissions.map((item) => item.permissionId),
          },
          newValues: {
            name: role.name,
            description: role.description,
            isGlobal: role.isGlobal,
            storeId: role.storeId,
            permissionIds: nextPermissionIds,
          },
        },
      });

      return role;
    });
  }
}

export const adminRoleService = new AdminRoleService();
