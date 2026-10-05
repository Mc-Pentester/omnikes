import { userRepository } from '@omnikes/repositories/user.repository';
import { authService } from '@omnikes/services/auth.service';
import { generateToken, hashToken } from '@omnikes/lib/crypto';
import { checkRateLimit, getRateLimitIdentifier } from '@omnikes/lib/rate-limiter';
import { securityLogger } from '@omnikes/lib/security-logger';
import { deliverPasswordResetLink, isPasswordResetDeliveryConfigured } from '@omnikes/lib/password-reset-delivery';

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
   * Request a password reset for an email.
   * The token is stored only as a hash. Delivery is optional so OmniKès
   * remains fully Local-First when no email transport is configured.
   */
  async requestPasswordReset(email: string, ipAddress?: string): Promise<{ success: boolean; message: string }> {
    // Combine normalized email and IP. Without a trusted proxy IP, this stays
    // per email instead of sharing one global ip:unknown bucket.
    const normalizedEmail = email.trim().toLowerCase();
    const rateLimitId = getRateLimitIdentifier(`reset:${normalizedEmail}`, ipAddress);
    const rateLimitResult = checkRateLimit(rateLimitId);
    
    if (!rateLimitResult.allowed) {
      throw new RateLimitError(
        'Too many password reset requests. Please try again later.',
        rateLimitResult.resetTime
      );
    }

    // Find user by email
    const user = await userRepository.findByEmail(normalizedEmail);

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

    securityLogger.passwordResetRequested(
      user.id,
      email,
      ipAddress,
      isPasswordResetDeliveryConfigured()
        ? 'Token generated and queued for delivery'
        : 'Token generated; no delivery transport configured',
    );

    // Optional delivery: no external service is required for Local-First use.
    // The raw token is never logged or returned by this API.
    if (isPasswordResetDeliveryConfigured()) {
      try {
        await deliverPasswordResetLink({ email, token, expiresAt });
      } catch (error) {
        securityLogger.passwordResetRequested(user.id, email, ipAddress, 'Password reset delivery failed');
        console.error('Password reset delivery failed:', error instanceof Error ? error.message : error);
      }
    }

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
    const rateLimitId = getRateLimitIdentifier(`reset-consume:${tokenHash}`, ipAddress);
    const rateLimitResult = checkRateLimit(rateLimitId);
    if (!rateLimitResult.allowed) {
      throw new RateLimitError(
        'Too many password reset attempts. Please try again later.',
        rateLimitResult.resetTime,
      );
    }

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
