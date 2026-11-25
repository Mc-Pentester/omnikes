import { Prisma } from '@prisma/client';
import { prisma } from '@omnikes/lib/prisma';
import { authService } from '@omnikes/services/auth.service';
import { roleRepository } from '@omnikes/repositories/role.repository';
import { userRepository } from '@omnikes/repositories/user.repository';
import {
  adminUserCreateSchema,
  adminUserUpdateSchema,
  AdminUserCreateInput,
  AdminUserUpdateInput,
} from '@omnikes/lib/validation';

export class AdminUserService {
  private async assertRolesAssignable(actorUserId: string, organizationId: string, roleIds: string[]) {
    const uniqueRoleIds = [...new Set(roleIds)];
    if (!uniqueRoleIds.length) throw new Error('At least one role is required');
    if (uniqueRoleIds.length !== roleIds.length) throw new Error('Duplicate role assignments are not allowed');

    const [actorRoles, targetRoles] = await Promise.all([
      roleRepository.getUserRoles(actorUserId),
      prisma.role.findMany({
        where: { id: { in: uniqueRoleIds }, organizationId },
        include: { rolePermissions: { select: { permission: { select: { code: true } } } } },
      }),
    ]);

    if (targetRoles.length !== uniqueRoleIds.length) throw new Error('One or more roles were not found');

    const actorPermissions = new Set(actorRoles.flatMap((role) => role.permissions));
    for (const targetRole of targetRoles) {
      const targetPermissions = targetRole.rolePermissions.map((rp) => rp.permission.code);
      if (targetPermissions.some((permission) => !actorPermissions.has(permission))) {
        throw new Error('Actor cannot delegate one or more permissions');
      }
      if (targetRole.isGlobal) {
        if (!actorRoles.some((role) => role.isGlobal)) {
          throw new Error('Global role assignment requires global administration');
        }
      } else {
        const authorizedStoreIds = await roleRepository.getAuthorizedStoreIds(actorUserId);
        if (authorizedStoreIds !== null && (!targetRole.storeId || !authorizedStoreIds.includes(targetRole.storeId))) {
          throw new Error('Role is outside the actor store scope');
        }
      }
    }

    return targetRoles;
  }

  async list(
    organizationId: string,
    search: string | undefined,
    actorUserId: string,
    options: { skip: number; take: number },
  ) {
    const actorStoreIds = await roleRepository.getAuthorizedStoreIds(actorUserId);

    const [userResult, roles, stores] = await Promise.all([
      userRepository.listByOrganization(organizationId, {
        search,
        authorizedStoreIds: actorStoreIds,
        skip: options.skip,
        take: options.take,
      }),
      prisma.role.findMany({
        where: { organizationId },
        select: { id: true, name: true, description: true, isGlobal: true, storeId: true },
        orderBy: [{ name: 'asc' }, { storeId: 'asc' }],
      }),
      prisma.store.findMany({
        where: { organizationId },
        select: { id: true, name: true, code: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const safeRoles = roles.filter((role) =>
      role.isGlobal ? actorStoreIds === null : actorStoreIds === null || (role.storeId ? actorStoreIds.includes(role.storeId) : false),
    );

    return {
      users: userResult.users,
      roles: safeRoles,
      stores: actorStoreIds === null ? stores : stores.filter((store) => actorStoreIds.includes(store.id)),
      pagination: {
        skip: userResult.skip,
        take: userResult.take,
        total: userResult.total,
      },
    };
  }

  private async resolveRole(roleId: string, organizationId: string, storeId?: string) {
    const role = await prisma.role.findFirst({
      where: { id: roleId, organizationId },
      select: { id: true, name: true, description: true, isGlobal: true, storeId: true },
    });

    if (!role) throw new Error('Role not found');

    if (storeId) {
      const store = await prisma.store.findFirst({
        where: { id: storeId, organizationId, isActive: true },
        select: { id: true },
      });
      if (!store) throw new Error('Store not found or inactive');

      if (!role.isGlobal && role.storeId !== storeId) {
        throw new Error('Role is not scoped to the selected store');
      }
    }

    return role;
  }

  private async replaceRole(userId: string, roleId: string) {
    await prisma.userRole.deleteMany({ where: { userId } });
    await prisma.userRole.create({ data: { userId, roleId } });
  }

  async create(organizationId: string, input: AdminUserCreateInput, actorUserId: string) {
    const data = adminUserCreateSchema.parse(input);
    const roleIds = data.roleIds ?? (data.roleId ? [data.roleId] : []);
    const roles = await this.assertRolesAssignable(actorUserId, organizationId, roleIds);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new Error('A user with this email already exists');

    const password = await authService.hashPassword(data.password);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: data.email,
          name: data.name,
          password,
          organizationId,
          isActive: true,
        },
        select: { id: true, email: true, name: true, isActive: true, createdAt: true },
      });

      await tx.userRole.createMany({
        data: roles.map((role) => ({ userId: created.id, roleId: role.id })),
        skipDuplicates: true,
      });

      await tx.auditLog.create({
        data: {
          userId: actorUserId,
          organizationId,
          action: 'USER_CREATED',
          module: 'users',
          entityId: created.id,
          entityType: 'User',
          newValues: {
            email: created.email,
            name: created.name,
            isActive: created.isActive,
            roleIds: roles.map((role) => role.id),
            roleNames: roles.map((role) => role.name),
            storeIds: roles.filter((role) => !role.isGlobal).map((role) => role.storeId),
          },
        },
      });

      return created;
    });

    return user;
  }

  async update(
    organizationId: string,
    userId: string,
    input: AdminUserUpdateInput,
    actorUserId: string,
  ) {
    const data = adminUserUpdateSchema.parse(input);
    const target = await userRepository.findByIdWithOrganization(userId, organizationId);
    if (!target) throw new Error('User not found');

    const actorStoreIds = await roleRepository.getAuthorizedStoreIds(actorUserId);
    if (actorStoreIds !== null) {
      const targetRoles = target.userRoles.map(({ role }) => role);
      const targetIsOutOfScope = targetRoles.length === 0 || targetRoles.some((role) =>
        role.isGlobal || !role.storeId || !actorStoreIds.includes(role.storeId),
      );
      if (targetIsOutOfScope) {
        throw new Error('Permission required: target user is outside the actor store scope');
      }
    }

    if (userId === actorUserId && data.isActive === false) throw new Error('You cannot deactivate your own account');
    if (data.email && data.email !== target.email) {
      const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
      if (existing && existing.id !== userId) throw new Error('A user with this email already exists');
    }

    const requestedRoleIds = data.roleIds ?? (data.roleId ? [data.roleId] : undefined);
    const selectedRoles = requestedRoleIds
      ? await this.assertRolesAssignable(actorUserId, organizationId, requestedRoleIds)
      : undefined;

    const updateData: Prisma.UserUpdateInput = {};
    if (data.email !== undefined) updateData.email = data.email;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.password !== undefined) updateData.password = await authService.hashPassword(data.password);

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: updateData,
        select: { id: true, email: true, name: true, isActive: true, updatedAt: true },
      });

      if (selectedRoles) {
        await tx.userRole.deleteMany({ where: { userId } });
        await tx.userRole.createMany({
          data: selectedRoles.map((role) => ({ userId, roleId: role.id })),
          skipDuplicates: true,
        });
      }

      if (data.password !== undefined || data.isActive === false) {
        await tx.session.updateMany({
          where: { userId },
          data: { revokedAt: new Date() },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actorUserId,
          organizationId,
          action: 'USER_UPDATED',
          module: 'users',
          entityId: userId,
          entityType: 'User',
          oldValues: requestedRoleIds
            ? { roleIds: target.userRoles.map(({ role }) => role.id) }
            : undefined,
          newValues: {
            ...(data.email !== undefined ? { email: data.email } : {}),
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
            ...(selectedRoles ? {
              roleIds: selectedRoles.map((role) => role.id),
              roleNames: selectedRoles.map((role) => role.name),
              storeIds: selectedRoles.filter((role) => !role.isGlobal).map((role) => role.storeId),
            } : {}),
            ...(data.password !== undefined ? { passwordChanged: true } : {}),
          },
        },
      });

      return user;
    });

    return updated;
  }

}

export const adminUserService = new AdminUserService();
