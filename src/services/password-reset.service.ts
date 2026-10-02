import { userRepository } from '@omnikes/repositories/user.repository';
import { authService } from '@omnikes/services/auth.service';
import { generateToken, hashToken } from '@omnikes/lib/crypto';
import { checkRateLimit, getIpRateLimitIdentifier } from '@omnikes/lib/rate-limiter';
import { securityLogger } from '@omnikes/lib/security-logger';

const TOKEN_EXPIRY_HOURS = 1; // Token valid for 1 hour

export class RateLimitError extends Error {
  constructor(message: string, public resetTime?: number) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class PasswordResetService {
  constructor() {
    // Rate limiting is handled at the route level
  }

  /**
   * Request a password reset for an email
   * Generates a reset token and stores it in the user record
   * In production, this would send an email with the reset link
   */
  async requestPasswordReset(email: string, ipAddress?: string): Promise<{ success: boolean; message: string }> {
    // Check rate limit by IP to prevent abuse
    const rateLimitId = getIpRateLimitIdentifier(ipAddress);
    const rateLimitResult = checkRateLimit(rateLimitId);
    
    if (!rateLimitResult.allowed) {
      throw new RateLimitError(
        'Too many password reset requests. Please try again later.',
        rateLimitResult.resetTime
      );
    }

    // Find user by email
    const user = await userRepository.findByEmail(email);

    // Always return success to prevent email enumeration
    // Even if user doesn't exist, we don't reveal that
    if (!user) {
      securityLogger.passwordResetRequested('unknown', email, ipAddress, 'User not found');
      return { 
        success: true, 
        message: 'If an account exists with this email, a password reset link has been sent.' 
      };
    }

    // Check if user is active
    if (!user.isActive) {
      securityLogger.passwordResetRequested(user.id, email, ipAddress, 'Account inactive');
      return { 
        success: true, 
        message: 'If an account exists with this email, a password reset link has been sent.' 
      };
    }

    // Generate a secure random token
    const token = generateToken();
    const tokenHash = hashToken(token);
    
    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

    // Store token hash and expiry in user record
    await userRepository.update(user.id, {
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpiresAt: expiresAt,
    });

    // Log the token for development (in production, send email instead)
    securityLogger.passwordResetRequested(user.id, email, ipAddress, 'Token generated');
    
    // Never log password-reset tokens. In local development without an email
    // transport, the token remains available only to the caller/test harness.
    // Production delivery must use the configured email transport.
    // In production, send email with reset link:
    // const resetLink = `${process.env.APP_URL}/reset-password?token=${token}`;
    // await sendEmail(email, 'Password Reset', `Click here to reset: ${resetLink}`);

    return { 
      success: true, 
      message: 'If an account exists with this email, a password reset link has been sent.' 
    };
  }

  /**
   * Reset password using a valid token
   */
  async resetPassword(token: string, newPassword: string, ipAddress?: string): Promise<{ success: boolean; message: string }> {
    const tokenHash = hashToken(token);

    // Find user with valid reset token
    const user = await userRepository.findByResetToken(tokenHash);

    if (!user) {
      securityLogger.passwordResetFailed(null, null, ipAddress, 'Invalid or expired token');
      return { 
        success: false, 
        message: 'Invalid or expired reset token. Please request a new password reset.' 
      };
    }

    // Check if token has expired
    if (!user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < new Date()) {
      securityLogger.passwordResetFailed(user.id, user.email, ipAddress, 'Token expired');
      // Clear expired token
      await userRepository.update(user.id, {
        resetPasswordTokenHash: null,
        resetPasswordExpiresAt: null,
      });
      return { 
        success: false, 
        message: 'Reset token has expired. Please request a new password reset.' 
      };
    }

    // Check if user is active
    if (!user.isActive) {
      securityLogger.passwordResetFailed(user.id, user.email, ipAddress, 'Account inactive');
      return { 
        success: false, 
        message: 'Account is inactive. Please contact support.' 
      };
    }

    // Hash new password
    const hashedPassword = await authService.hashPassword(newPassword);

    // Update password and clear reset token
    await userRepository.update(user.id, {
      password: hashedPassword,
      resetPasswordTokenHash: null,
      resetPasswordExpiresAt: null,
    });

    // Revoke all sessions for security
    await userRepository.revokeAllSessions(user.id);

    securityLogger.passwordResetSuccess(user.id, user.email, ipAddress);

    return { 
      success: true, 
      message: 'Password has been reset successfully. Please login with your new password.' 
    };
  }

  /**
   * Validate a reset token without consuming it
   * Used to check if the reset link is still valid before showing the form
   */
  async validateResetToken(token: string): Promise<{ valid: boolean; message: string }> {
    const tokenHash = hashToken(token);
    const user = await userRepository.findByResetToken(tokenHash);

    if (!user) {
      return { valid: false, message: 'Invalid reset token' };
    }

    if (!user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < new Date()) {
      return { valid: false, message: 'Reset token has expired' };
    }

    return { valid: true, message: 'Token is valid' };
  }
}

export const passwordResetService = new PasswordResetService();
