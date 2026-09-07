import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

export class SessionRepository {
  /**
   * Create a new session
   */
  async create(data: Prisma.SessionCreateInput) {
    return prisma.session.create({
      data,
      include: {
        user: {
          include: {
            organization: true,
          },
        },
      },
    });
  }

  /**
   * Find a session by token
   */
  async findByToken(token: string) {
    return prisma.session.findUnique({
      where: { token },
      include: {
        user: {
          include: {
            organization: true,
            userRoles: {
              include: {
                role: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Find a valid (non-expired, non-revoked) session by token
   */
  async findValidByToken(token: string) {
    const session = await prisma.session.findUnique({
      where: { token },
      include: {
        user: {
          include: {
            organization: true,
            userRoles: {
              include: {
                role: true,
              },
            },
          },
        },
      },
    });

    if (!session) return null;

    // Check if session is expired
    if (session.expiresAt < new Date()) return null;

    // Check if session is revoked
    if (session.revokedAt) return null;

    return session;
  }

  /**
   * Update last accessed timestamp. Should be called on each authenticated request.
   */
  async updateLastAccessed(token: string) {
    return prisma.session.updateMany({
      where: { token },
      data: {
        lastAccessedAt: new Date(),
      },
    });
  }

  /**
   * Revoke a session
   */
  async revoke(token: string) {
    return prisma.session.updateMany({
      where: { token },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeAllForUser(userId: string) {
    return prisma.session.updateMany({
      where: { userId },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Clean up expired sessions (can be run as a scheduled job)
   */
  async deleteExpired() {
    return prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
  }

  /**
   * Clean up revoked sessions older than specified days
   */
  async deleteOldRevoked(daysOld: number = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return prisma.session.deleteMany({
      where: {
        revokedAt: {
          lte: cutoffDate,
        },
      },
    });
  }
}

export const sessionRepository = new SessionRepository();
