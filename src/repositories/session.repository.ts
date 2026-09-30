import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';
import { hashToken, constantTimeCompare } from '@omnikes/lib/crypto';

export class SessionRepository {
  /**
   * Create a new session with hashed token
   * Raw token is NEVER persisted - only tokenHash is stored
   */
  async create(data: Omit<Prisma.SessionCreateInput, 'tokenHash'>, rawToken: string) {
    // Hash the token and store ONLY tokenHash
    const sessionData: Prisma.SessionCreateInput = { ...data, tokenHash: hashToken(rawToken) };

    const session = await prisma.session.create({
      data: sessionData,
      include: {
        user: {
          include: {
            organization: true,
          },
        },
      },
    });

    // Return session with raw token attached for cookie creation
    // This is safe because it's only in memory, never persisted
    return { ...session, token: rawToken };
  }

  /**
   * Find a session by token hash
   * Only tokenHash is used for lookup - raw token is never accepted
   */
  async findByToken(token: string) {
    const tokenHash = hashToken(token);
    return prisma.session.findFirst({
      where: {
        tokenHash, // Secure approach - only hash lookup
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
   * Only tokenHash is used for lookup - raw token is never accepted
   */
  async findValidByToken(token: string) {
    const tokenHash = hashToken(token);

    const session = await prisma.session.findFirst({
      where: {
        tokenHash, // Secure approach - only hash lookup
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
   * Only tokenHash is used for lookup - raw token is never accepted
   */
  async updateLastAccessed(token: string) {
    const tokenHash = hashToken(token);

    return prisma.session.updateMany({
      where: {
        tokenHash, // Secure approach - only hash lookup
      },
      data: {
        lastAccessedAt: new Date(),
      },
    });
  }

  /**
   * Revoke a session by token hash
   * Only tokenHash is used for lookup - raw token is never accepted
   */
  async revoke(token: string) {
    const tokenHash = hashToken(token);

    return prisma.session.updateMany({
      where: {
        tokenHash, // Secure approach - only hash lookup
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
