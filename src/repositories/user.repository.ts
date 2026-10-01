import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

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

  async listByOrganization(organizationId: string, search?: string) {
    return prisma.user.findMany({
      where: {
        organizationId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
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
      orderBy: { createdAt: 'asc' },
    });
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
