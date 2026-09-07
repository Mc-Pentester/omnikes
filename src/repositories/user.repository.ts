import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

export class UserRepository {
  /**
   * Find a user by email
   */
  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: {
        organization: true,
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });
  }

  /**
   * Find a user by ID
   */
  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        organization: true,
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });
  }

  /**
   * Find a user by ID with organization check
   */
  async findByIdWithOrganization(id: string, organizationId: string) {
    return prisma.user.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        organization: true,
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });
  }

  /**
   * Create a new user
   */
  async create(data: Prisma.UserCreateInput) {
    return prisma.user.create({
      data,
      include: {
        organization: true,
      },
    });
  }

  /**
   * Update a user
   */
  async update(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  /**
   * Update last login timestamp
   */
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

  /**
   * Increment failed login attempts
   */
  async incrementFailedAttempts(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { failedLoginAttempts: true },
    });

    if (!user) return null;

    const newAttempts = (user.failedLoginAttempts || 0) + 1;
    const updateData: Prisma.UserUpdateInput = {
      failedLoginAttempts: newAttempts,
    };

    // Lock account after 5 failed attempts
    if (newAttempts >= 5) {
      updateData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    }

    return prisma.user.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Check if user account is locked
   */
  async isLocked(id: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { lockedUntil: true },
    });

    if (!user || !user.lockedUntil) return false;

    return user.lockedUntil > new Date();
  }
}

export const userRepository = new UserRepository();
