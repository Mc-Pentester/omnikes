import { prisma } from '@omnikes/lib/prisma';
import { authService } from '@omnikes/services/auth.service';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { userRepository } from '@omnikes/repositories/user.repository';
import { organizationRepository } from '@omnikes/repositories/organization.repository';
import { generateUniqueSlug } from '@omnikes/lib/slug';
import { checkRateLimit, getAccountRateLimitIdentifier, getIpRateLimitIdentifier, startRateLimitCleanup } from '@omnikes/lib/rate-limiter';
import { randomBytes } from 'crypto';
import { ADMIN_ROLE, CASHIER_ROLE, TENANT_PERMISSION_CODES, provisionStandardTenantRoles } from '@omnikes/lib/rbac/standard-tenant-roles';

// Permission definitions and standard role grants come from the shared RBAC catalogue.
function permissionModule(code: string): string {
  const prefix = code.split('.')[0];
  if (prefix === 'sale' || prefix === 'payment') return 'sales';
  if (prefix === 'report') return 'reports';
  return prefix;
}

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

    // Normalize email before applying the registration quota. When no trusted
    // proxy IP is available, the quota remains per email instead of becoming
    // one global ip:unknown bucket for the whole instance.
    const normalizedEmail = this.normalizeEmail(email);
    if (ipAddress) {
      const ipRateLimitResult = await checkRateLimit(getIpRateLimitIdentifier(ipAddress, 'registration'));
      if (!ipRateLimitResult.allowed) {
        throw new RateLimitError(
          'Too many registration attempts. Please try again later.',
          ipRateLimitResult.resetTime,
        );
      }
    }

    const rateLimitId = getAccountRateLimitIdentifier(normalizedEmail, 'registration');
    const rateLimitResult = await checkRateLimit(rateLimitId);

    if (!rateLimitResult.allowed) {
      throw new RateLimitError(
        'Too many registration attempts. Please try again later.',
        rateLimitResult.resetTime
      );
    }

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

      // Repair the permission catalogue at first launch. The offline installer
      // normally initializes it, but registration must remain reliable if that
      // optional bootstrap step was skipped or targeted another database.
      await tx.permission.createMany({
        data: TENANT_PERMISSION_CODES.map((code) => ({
          code,
          description: 'Permission ' + code,
          module: permissionModule(code),
        })),
        skipDuplicates: true,
      });

      // Create an organization-scoped ADMIN role for the new tenant.
      // "isGlobal" means all stores inside this organization, never cross-tenant.
      const adminRole = await tx.role.create({
        data: {
          name: ADMIN_ROLE.name,
          description: ADMIN_ROLE.description,
          organizationId: organization.id,
          isGlobal: true,
        },
      });

      // A newly registered administrator must receive the existing permission
      // catalog explicitly. Permissions themselves are global definitions;
      // the role carrying them is tenant-scoped.
      const permissions = await tx.permission.findMany({
        where: { code: { in: [...TENANT_PERMISSION_CODES] } },
        select: { id: true, code: true },
      });

      if (permissions.length !== TENANT_PERMISSION_CODES.length) {
        throw new Error('Tenant RBAC catalogue is incomplete; cannot create administrator role');
      }

      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: adminRole.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });

      // Provision the standard cashier role so the first administrator can
      // create staff accounts immediately. Its permissions are deliberately
      // narrower than ADMIN and its scope remains inside this organization.
      const cashierRole = await tx.role.create({
        data: {
          name: CASHIER_ROLE.name,
          description: CASHIER_ROLE.description,
          organizationId: organization.id,
          isGlobal: true,
        },
      });
      const cashierPermissions = await tx.permission.findMany({
        where: { code: { in: [...CASHIER_ROLE.permissions] } },
        select: { id: true },
      });
      if (cashierPermissions.length !== CASHIER_ROLE.permissions.length) {
        throw new Error('Cashier role permission catalogue is incomplete.');
      }
      await tx.rolePermission.createMany({
        data: cashierPermissions.map((permission) => ({
          roleId: cashierRole.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });

      await provisionStandardTenantRoles(tx, organization.id);

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
