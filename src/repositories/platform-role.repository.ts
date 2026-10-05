import { prisma } from '@omnikes/lib/prisma';

export const PLATFORM_SUBSCRIPTION_PERMISSION = 'organization.subscription.manage';
export const PLATFORM_OPERATOR_ROLE = 'OMNIKES_PLATFORM_OPERATOR';

export class PlatformRoleRepository {
  async getUserPermissions(userId: string): Promise<string[]> {
    const assignments = await prisma.platformUserRole.findMany({
      where: {
        userId,
        platformRole: { isActive: true },
      },
      select: {
        platformRole: {
          select: {
            rolePermissions: {
              select: {
                platformPermission: { select: { code: true } },
              },
            },
          },
        },
      },
    });

    return [...new Set(
      assignments.flatMap((assignment) =>
        assignment.platformRole.rolePermissions.map((item) => item.platformPermission.code),
      ),
    )];
  }

  async hasPermission(userId: string, permissionCode: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.includes(permissionCode);
  }

  async hasRole(userId: string, roleName: string): Promise<boolean> {
    const assignment = await prisma.platformUserRole.findFirst({
      where: {
        userId,
        platformRole: {
          name: roleName,
          isActive: true,
        },
      },
      select: { id: true },
    });

    return Boolean(assignment);
  }
}

export const platformRoleRepository = new PlatformRoleRepository();
