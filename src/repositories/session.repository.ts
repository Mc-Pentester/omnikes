import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';
import { hashToken, constantTimeCompare } from '@omnikes/lib/crypto';

export class SessionRepository {
  /**
   * Create a new session with hashed token
   */
  async create(data: Prisma.SessionCreateInput) {
    // Hash the token and store it in tokenHash
    // Keep token for backward compatibility during migration
    const sessionData: Prisma.SessionCreateInput = { ...data };
    
    if (sessionData.token) {
      sessionData.tokenHash = hashToken(sessionData.token);
    }

    return prisma.session.create({
      data: sessionData,
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
   * Find a session by token (for backward compatibility during migration)
   * @deprecated Use findByTokenHash instead
   */
  async findByToken(token: string) {
    const tokenHash = hashToken(token);
    return prisma.session.findFirst({
      where: {
        OR: [
          { token }, // Fallback for old sessions during migration
          { tokenHash }, // New secure approach
        ],
      },
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
   * Find a valid (non-expired, non-revoked) session by token hash
   */
  async findValidByToken(token: string) {
    const tokenHash = hashToken(token);
    
    const session = await prisma.session.findFirst({
      where: {
        OR: [
          { token }, // Fallback for old sessions during migration
          { tokenHash }, // New secure approach
        ],
      },
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
   * Update last accessed timestamp by token hash
   */
  async updateLastAccessed(token: string) {
    const tokenHash = hashToken(token);
    
    return prisma.session.updateMany({
      where: {
        OR: [
          { token },
          { tokenHash },
        ],
      },
      data: {
        lastAccessedAt: new Date(),
      },
    });
  }

  /**
   * Revoke a session by token hash
   */
  async revoke(token: string) {
    const tokenHash = hashToken(token);
    
    return prisma.session.updateMany({
      where: {
        OR: [
          { token },
          { tokenHash },
        ],
      },
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
   * Count active (non-expired, non-revoked) sessions for a user
   */
  async countActiveForUser(userId: string): Promise<number> {
    return prisma.session.count({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
    });
  }

  /**
   * Revoke oldest sessions to keep only N active sessions per user
   */
  async revokeOldestSessions(userId: string, maxSessions: number) {
    const activeSessions = await prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
      },
    });

    if (activeSessions.length <= maxSessions) {
      return; // No need to revoke
    }

    const sessionsToRevoke = activeSessions.slice(0, activeSessions.length - maxSessions);
    const sessionIds = sessionsToRevoke.map(s => s.id);

    await prisma.session.updateMany({
      where: {
        id: {
          in: sessionIds,
        },
      },
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
