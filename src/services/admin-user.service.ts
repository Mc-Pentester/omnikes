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
  private async assertRoleAssignable(actorUserId: string, organizationId: string, roleId: string) {
    const [actorRoles, targetRole] = await Promise.all([
      roleRepository.getUserRoles(actorUserId),
      prisma.role.findFirst({
        where: { id: roleId, organizationId },
        include: { rolePermissions: { select: { permission: { select: { code: true } } } } },
      }),
    ]);

    if (!targetRole) throw new Error('Role not found');

    const actorPermissions = new Set(actorRoles.flatMap((role) => role.permissions));
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

    return targetRole;
  }

  async list(organizationId: string, search: string | undefined, actorUserId: string) {
    const [allUsers, roles, stores] = await Promise.all([
      userRepository.listByOrganization(organizationId, search),
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

    const actorStoreIds = await roleRepository.getAuthorizedStoreIds(actorUserId);
    const safeRoles = roles.filter((role) =>
      role.isGlobal ? actorStoreIds === null : actorStoreIds === null || (role.storeId ? actorStoreIds.includes(role.storeId) : false),
    );
    const users = actorStoreIds === null
      ? allUsers
      : allUsers.filter((item) => item.userRoles.some(({ role }) => role.isGlobal || (role.storeId ? actorStoreIds.includes(role.storeId) : false)));

    return { users, roles: safeRoles, stores: actorStoreIds === null ? stores : stores.filter((store) => actorStoreIds.includes(store.id)) };
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
    const role = await this.assertRoleAssignable(actorUserId, organizationId, data.roleId);
    if (role.isGlobal && data.storeId) throw new Error('Global role cannot be assigned to a specific store');
    if (!role.isGlobal && data.storeId && role.storeId !== data.storeId) throw new Error('Role is not scoped to the selected store');

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

      await tx.userRole.create({ data: { userId: created.id, roleId: role.id } });

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
            roleId: role.id,
            roleName: role.name,
            storeId: data.storeId ?? null,
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
    if (userId === actorUserId && data.isActive === false) throw new Error('You cannot deactivate your own account');
    if (data.email && data.email !== target.email) {
      const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
      if (existing && existing.id !== userId) throw new Error('A user with this email already exists');
    }

    if (data.roleId) {
      const selectedRole = await this.assertRoleAssignable(actorUserId, organizationId, data.roleId);
      if (selectedRole.isGlobal && data.storeId) throw new Error('Global role cannot be assigned to a specific store');
      if (!selectedRole.isGlobal && data.storeId && selectedRole.storeId !== data.storeId) {
        throw new Error('Role is not scoped to the selected store');
      }
    } else if (data.storeId) {
      const currentRole = target.userRoles[0]?.role;
      if (!currentRole) throw new Error('User has no role');
      const resolvedCurrentRole = await this.assertRoleAssignable(actorUserId, organizationId, currentRole.id);
      if (resolvedCurrentRole.isGlobal || resolvedCurrentRole.storeId !== data.storeId) throw new Error('Role is not scoped to the selected store');
    }

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

      if (data.roleId) {
        await tx.userRole.deleteMany({ where: { userId } });
        await tx.userRole.create({ data: { userId, roleId: data.roleId } });
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
          newValues: {
            ...(data.email !== undefined ? { email: data.email } : {}),
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
            ...(data.roleId !== undefined ? { roleId: data.roleId } : {}),
            ...(data.storeId !== undefined ? { storeId: data.storeId } : {}),
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
