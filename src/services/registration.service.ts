import { prisma } from '@omnikes/lib/prisma';
import { authService } from '@omnikes/services/auth.service';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { userRepository } from '@omnikes/repositories/user.repository';
import { organizationRepository } from '@omnikes/repositories/organization.repository';
import { generateUniqueSlug } from '@omnikes/lib/slug';
import { checkRateLimit, getIpRateLimitIdentifier, startRateLimitCleanup } from '@omnikes/lib/rate-limiter';
import { randomBytes } from 'crypto';

export interface RegisterInput {
  organizationName: string;
  name: string;
  email: string;
  password: string;
}

export interface RegisterResult {
  user: {
    id: string;
    email: string;
    name: string | null;
    organizationId: string;
    organizationName: string;
  };
  token: string;
  expiresAt: Date;
}

export class RateLimitError extends Error {
  constructor(message: string, public resetTime?: number) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class RegistrationService {
  constructor() {
    // Start cleanup timer on first instantiation
    startRateLimitCleanup();
  }

  /**
   * Register a new user with a new organization
   * Creates: Organization, User, ADMIN Role, UserRole, Session
   * Rate limited by IP to prevent mass registration
   */
  async register(data: RegisterInput, ipAddress?: string, userAgent?: string): Promise<RegisterResult> {
    const { organizationName, name, email, password } = data;

    // Check rate limit by IP to prevent mass registration
    const rateLimitId = getIpRateLimitIdentifier(ipAddress);
    const rateLimitResult = checkRateLimit(rateLimitId);
    
    if (!rateLimitResult.allowed) {
      throw new RateLimitError(
        'Too many registration attempts. Please try again later.',
        rateLimitResult.resetTime
      );
    }

    // Normalize email
    const normalizedEmail = this.normalizeEmail(email);

    // Check if email already exists
    const existingUser = await userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new Error('Cette adresse email est déjà utilisée');
    }

    // Generate unique slug for organization
    const slug = await generateUniqueSlug(organizationName, (s) => organizationRepository.slugExists(s));

    // Hash password
    const hashedPassword = await authService.hashPassword(password);

    // Transaction: create Organization, User, Role, UserRole
    const result = await prisma.$transaction(async (tx) => {
      // Create Organization
      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          slug,
          country: 'HT', // Default to Haiti
          currency: 'HTG', // Default to Haitian Gourde
          locale: 'fr-HT',
          timezone: 'America/Port-au-Prince',
        },
      });

      // Create an organization-scoped ADMIN role for the new tenant.
      // "isGlobal" means all stores inside this organization, never cross-tenant.
      const adminRole = await tx.role.create({
        data: {
          name: 'ADMIN',
          description: 'Administrator role',
          organizationId: organization.id,
          isGlobal: true,
        },
      });

      // A newly registered administrator must receive the existing permission
      // catalog explicitly. Permissions themselves are global definitions;
      // the role carrying them is tenant-scoped.
      const permissions = await tx.permission.findMany({
        select: { id: true },
      });

      if (permissions.length === 0) {
        throw new Error('No permissions are configured; cannot create administrator role');
      }

      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: adminRole.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });

      // Create User
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          name,
          password: hashedPassword,
          organizationId: organization.id,
          isActive: true,
        },
      });

      // Create UserRole
      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: adminRole.id,
        },
      });

      return { organization, user };
    });

    // Create session after successful transaction
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await sessionRepository.create({
      user: {
        connect: { id: result.user.id },
      },
      expiresAt,
      ipAddress,
      userAgent,
    }, token);

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        organizationId: result.organization.id,
        organizationName: result.organization.name,
      },
      token,
      expiresAt,
    };
  }

  /**
   * Normalize email address
   */
  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Generate a random session token
   */
  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }
}

export const registrationService = new RegistrationService();
