import { prisma } from '@omnikes/lib/prisma';

export interface RoleWithPermissions {
  id: string;
  name: string;
  description: string | null;
  isGlobal: boolean;
  storeId: string | null;
  organizationId: string | null;
  permissions: string[]; // Array of permission codes
}

export class RoleRepository {
  /**
   * Get all roles with permissions for a user.
   *
   * Every role used for authorization must belong to the user's organization.
   * isGlobal means global across that organization, not cross-tenant.
   */
  async getUserRoles(userId: string): Promise<RoleWithPermissions[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });

    if (!user) return [];

    const userRoles = await prisma.userRole.findMany({
      where: {
        userId,
        role: {
          organizationId: user.organizationId,
        },
      },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    return userRoles.map((ur) => ({
      id: ur.role.id,
      name: ur.role.name,
      description: ur.role.description,
      isGlobal: ur.role.isGlobal,
      storeId: ur.role.storeId,
      organizationId: ur.role.organizationId,
      permissions: ur.role.rolePermissions.map((rp) => rp.permission.code),
    }));
  }

  async hasGlobalRoleWithPermission(userId: string, permissionCode: string): Promise<boolean> {
    const userRoles = await this.getUserRoles(userId);
    return userRoles.some(
      (role) => role.isGlobal && role.permissions.includes(permissionCode),
    );
  }

  async hasPermission(userId: string, permissionCode: string): Promise<boolean> {
    const userRoles = await this.getUserRoles(userId);
    
    for (const role of userRoles) {
      if (role.permissions.includes(permissionCode)) {
        return true;
      }
    }
    
    return false;
  }

  async hasAnyPermission(userId: string, permissionCodes: string[]): Promise<boolean> {
    const userRoles = await this.getUserRoles(userId);
    
    for (const role of userRoles) {
      for (const permissionCode of permissionCodes) {
        if (role.permissions.includes(permissionCode)) {
          return true;
        }
      }
    }
    
    return false;
  }

  async hasRole(userId: string, roleName: string): Promise<boolean> {
    const userRoles = await this.getUserRoles(userId);
    
    return userRoles.some((role) => role.name === roleName);
  }

  async getAuthorizedStoreIds(userId: string): Promise<string[] | null> {
    const userRoles = await this.getUserRoles(userId);
    
    if (userRoles.some((role) => role.isGlobal)) {
      return null;
    }
    
    const storeIds = [...new Set(
      userRoles
        .map((role) => role.storeId)
        .filter((storeId): storeId is string => storeId !== null),
    )];

    if (storeIds.length === 0) {
      return [];
    }

    // Defense in depth: a scoped role may be malformed and point at a
    // store outside the user's organization. Never expose such store IDs
    // to callers that use this helper for list/filter authorization.
    const organizationStores = await prisma.store.findMany({
      where: {
        id: { in: storeIds },
        organizationId: user.organizationId,
      },
      select: { id: true },
    });

    return organizationStores.map((store) => store.id);
  }

  async canAccessStore(userId: string, storeId: string): Promise<boolean> {
    const [user, store] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      }),
      prisma.store.findUnique({
        where: { id: storeId },
        select: { organizationId: true },
      }),
    ]);

    if (!user || !store) {
      return false;
    }

    if (user.organizationId !== store.organizationId) {
      return false;
    }

    const authorizedStoreIds = await this.getAuthorizedStoreIds(userId);

    if (authorizedStoreIds === null) {
      return true;
    }

    return authorizedStoreIds.includes(storeId);
  }
}

export const roleRepository = new RoleRepository();
