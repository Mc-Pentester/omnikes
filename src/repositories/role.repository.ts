import { prisma } from '@omnikes/lib/prisma';

export interface RoleWithPermissions {
  id: string;
  name: string;
  description: string | null;
  isGlobal: boolean;
  storeId: string | null;
  permissions: string[]; // Array of permission codes
}

export class RoleRepository {
  /**
   * Get all roles with permissions for a user
   */
  async getUserRoles(userId: string): Promise<RoleWithPermissions[]> {
    const userRoles = await prisma.userRole.findMany({
      where: { userId },
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
      permissions: ur.role.rolePermissions.map((rp) => rp.permission.code),
    }));
  }

  /**
   * Check if user has a specific permission
   */
  async hasPermission(userId: string, permissionCode: string): Promise<boolean> {
    const userRoles = await this.getUserRoles(userId);
    
    for (const role of userRoles) {
      if (role.permissions.includes(permissionCode)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if user has any of the specified permissions
   */
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

  /**
   * Check if user has a specific role
   */
  async hasRole(userId: string, roleName: string): Promise<boolean> {
    const userRoles = await this.getUserRoles(userId);
    
    return userRoles.some((role) => role.name === roleName);
  }

  /**
   * Get authorized store IDs for a user
   * Returns null if user has global access (isGlobal = true)
   * Returns array of store IDs if user is scoped to specific stores
   */
  async getAuthorizedStoreIds(userId: string): Promise<string[] | null> {
    const userRoles = await this.getUserRoles(userId);
    
    // If any role is global, user has access to all stores in organization
    if (userRoles.some((role) => role.isGlobal)) {
      return null; // null means global access
    }
    
    // Collect all store IDs from scoped roles
    const storeIds = userRoles
      .map((role) => role.storeId)
      .filter((storeId): storeId is string => storeId !== null);
    
    // Remove duplicates
    return [...new Set(storeIds)];
  }

  /**
   * Check if user is authorized to access a specific store
   */
  async canAccessStore(userId: string, storeId: string): Promise<boolean> {
    const authorizedStoreIds = await this.getAuthorizedStoreIds(userId);
    
    // null means global access to all stores
    if (authorizedStoreIds === null) {
      return true;
    }
    
    return authorizedStoreIds.includes(storeId);
  }
}

export const roleRepository = new RoleRepository();
