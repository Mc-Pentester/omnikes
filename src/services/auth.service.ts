import bcrypt from 'bcryptjs';
import { userRepository } from '@omnikes/repositories/user.repository';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { randomBytes } from 'crypto';

export class AuthService {
  /**
   * Login with email and password
   * Returns session token on success
   */
  async login(email: string, password: string, ipAddress?: string, userAgent?: string) {
    // Find user by email
    const user = await userRepository.findByEmail(email);

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error('Account is inactive');
    }

    // Check if account is locked
    const isLocked = await userRepository.isLocked(user.id);
    if (isLocked) {
      throw new Error('Account is temporarily locked due to too many failed login attempts');
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password);
    if (!passwordValid) {
      await userRepository.incrementFailedAttempts(user.id);
      throw new Error('Invalid credentials');
    }

    // Update last login
    await userRepository.updateLastLogin(user.id);

    // Create session
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const session = await sessionRepository.create({
      user: {
        connect: { id: user.id },
      },
      token,
      expiresAt,
      ipAddress,
      userAgent,
    });

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
   * Generate a random session token
   */
  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }
}

export const authService = new AuthService();
