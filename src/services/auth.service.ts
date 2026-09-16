import bcrypt from 'bcryptjs';
import { userRepository } from '@omnikes/repositories/user.repository';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { generateToken } from '@omnikes/lib/crypto';
import { checkRateLimit, resetRateLimit, getRateLimitIdentifier } from '@omnikes/lib/rate-limiter';
import { securityLogger } from '@omnikes/lib/security-logger';

const MAX_SESSIONS_PER_USER = 10; // Limit concurrent sessions per user

export class AuthService {
  /**
   * Login with email and password
   * Returns session token on success
   */
  async login(email: string, password: string, ipAddress?: string, userAgent?: string) {
    // Check rate limit
    const rateLimitId = getRateLimitIdentifier(email, ipAddress);
    const rateLimitResult = checkRateLimit(rateLimitId);
    
    if (!rateLimitResult.allowed) {
      securityLogger.rateLimitExceeded(rateLimitId, ipAddress);
      // Generic error message to prevent enumeration
      throw new Error('Too many login attempts. Please try again later.');
    }

    // Find user by email
    const user = await userRepository.findByEmail(email);

    if (!user) {
      securityLogger.loginFailed(email, ipAddress, userAgent, 'User not found');
      throw new Error('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      securityLogger.loginFailed(email, ipAddress, userAgent, 'Account inactive');
      throw new Error('Invalid credentials');
    }

    // Check if account is locked
    const isLocked = await userRepository.isLocked(user.id);
    if (isLocked) {
      securityLogger.accountLocked(user.id, email, ipAddress);
      throw new Error('Too many login attempts. Please try again later.');
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      await userRepository.incrementFailedAttempts(user.id);
      securityLogger.loginFailed(email, ipAddress, userAgent, 'Invalid password');
      throw new Error('Invalid credentials');
    }

    // Reset rate limit on successful login
    resetRateLimit(rateLimitId);

    // Update last login
    await userRepository.updateLastLogin(user.id);

    // Revoke oldest sessions if limit exceeded
    await sessionRepository.revokeOldestSessions(user.id, MAX_SESSIONS_PER_USER);

    // Create session with hashed token
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const session = await sessionRepository.create({
      user: {
        connect: { id: user.id },
      },
      token, // Will be hashed in repository
      expiresAt,
      ipAddress,
      userAgent,
    });

    securityLogger.loginSuccess(user.id, email, user.organizationId, ipAddress, userAgent);
    securityLogger.sessionCreated(user.id, email, ipAddress, userAgent);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
      },
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Logout by revoking the session token
   */
  async logout(token: string) {
    const session = await sessionRepository.findValidByToken(token);
    if (session) {
      securityLogger.sessionRevoked(session.userId, session.ipAddress || undefined);
    }
    await sessionRepository.revoke(token);
  }

  /**
   * Validate session and return user with organization
   */
  async validateSession(token: string) {
    const session = await sessionRepository.findValidByToken(token);

    if (!session) {
      throw new Error('Invalid or expired session');
    }

    // Update last accessed
    await sessionRepository.updateLastAccessed(token);

    // Check if user is still active
    if (!session.user.isActive) {
      await sessionRepository.revoke(token);
      throw new Error('Account is inactive');
    }

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        organizationId: session.user.organizationId,
        organizationName: session.user.organization.name,
      },
      organizationId: session.user.organizationId,
      organizationName: session.user.organization.name,
    };
  }

  /**
   * Get current user from session token
   */
  async getCurrentUser(token: string) {
    const session = await sessionRepository.findValidByToken(token);

    if (!session) {
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      organizationId: session.user.organizationId,
      organizationName: session.user.organization.name,
    };
  }

  /**
   * Hash a password (for user creation)
   */
  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  /**
   * Change password and revoke all sessions
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await userRepository.findById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }

    // Verify old password
    const passwordValid = await bcrypt.compare(oldPassword, user.password);
    if (!passwordValid) {
      throw new Error('Invalid current password');
    }

    // Hash new password
    const hashedPassword = await this.hashPassword(newPassword);

    // Update password
    await userRepository.update(userId, { password: hashedPassword });

    // Revoke all sessions for security
    await userRepository.revokeAllSessions(userId);

    securityLogger.passwordChanged(userId, user.email);
  }
}

export const authService = new AuthService();
