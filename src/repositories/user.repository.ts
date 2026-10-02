import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

export interface UserListOptions {
  search?: string;
  authorizedStoreIds?: string[] | null;
  skip?: number;
  take?: number;
}

export class UserRepository {
  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: {
        organization: true,
        userRoles: { include: { role: true } },
      },
    });
  }

  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        organization: true,
        userRoles: { include: { role: true } },
      },
    });
  }

  async findByIdWithOrganization(id: string, organizationId: string) {
    return prisma.user.findFirst({
      where: { id, organizationId },
      include: {
        organization: true,
        userRoles: { include: { role: true } },
      },
    });
  }

  async listByOrganization(organizationId: string, options: UserListOptions = {}) {
    const { search, authorizedStoreIds, skip = 0, take = 50 } = options;

    const where: Prisma.UserWhereInput = {
      organizationId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    if (authorizedStoreIds != null) {
      if (authorizedStoreIds.length === 0) {
        return { users: [], total: 0, skip, take };
      }

      where.userRoles = {
        some: {
          role: {
            OR: [
              { isGlobal: true },
              { storeId: { in: authorizedStoreIds } },
            ],
          },
        },
      };
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true,
          userRoles: {
            select: {
              role: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  isGlobal: true,
                  storeId: true,
                },
              },
            },
          },
        },
        skip,
        take,
        orderBy: { createdAt: 'asc' },
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total, skip, take };
  }

  async create(data: Prisma.UserCreateInput) {
    return prisma.user.create({
      data,
      include: { organization: true },
    });
  }

  async update(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({ where: { id }, data });
  }

  async updateLastLogin(id: string) {
    return prisma.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  async revokeAllSessions(id: string) {
    return prisma.session.updateMany({
      where: { userId: id },
      data: { revokedAt: new Date() },
    });
  }

  async incrementFailedAttempts(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { failedLoginAttempts: true },
    });

    if (!user) return null;

    return prisma.user.update({
      where: { id },
      data: {
        failedLoginAttempts: { increment: 1 },
        lockedUntil:
          (user.failedLoginAttempts || 0) >= 4
            ? new Date(Date.now() + 15 * 60 * 1000)
            : undefined,
      },
    });
  }

  async isLocked(id: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { lockedUntil: true },
    });

    return !!user?.lockedUntil && user.lockedUntil > new Date();
  }

  async findByResetToken(tokenHash: string) {
    return prisma.user.findFirst({
      where: {
        resetPasswordTokenHash: tokenHash,
        resetPasswordExpiresAt: { gt: new Date() },
      },
    });
  }
}

export const userRepository = new UserRepository();
