import { prisma } from '@omnikes/lib/prisma';
import { authService } from '@omnikes/services/auth.service';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { userRepository } from '@omnikes/repositories/user.repository';
import { generateUniqueSlug } from '@omnikes/lib/slug';
import { checkRateLimit, getAccountRateLimitIdentifier, getIpRateLimitIdentifier, startRateLimitCleanup } from '@omnikes/lib/rate-limiter';
import { randomBytes } from 'crypto';
import { provisionStandardOrganizationRoles } from '@omnikes/lib/rbac/standard-organization-roles';

export interface RegisterInput {
  organizationName?: string;
  name: string;
  email: string;
  password: string;
  country: string;
  currency: string;
  locale: string;
  timezone: string;
}

export interface RegisterResult {
  user: {
    id: string;
    email: string;
    name: string | null;
    organizationId: string;
    organizationName: string;
  };
  token: string | null;
  expiresAt: Date | null;
  pendingApproval: boolean;
}

export class RateLimitError extends Error {
  constructor(message: string, public resetTime?: number) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class RegistrationService {
  constructor() {
    startRateLimitCleanup();
  }

  /**
   * First registration creates the installation's organization and its initial
   * administrator. Later registrations create inactive, role-less accounts in
   * that same organization; an administrator must assign roles and activate them.
   */
  async register(data: RegisterInput, ipAddress?: string, userAgent?: string): Promise<RegisterResult> {
    const { organizationName, name, email, password, country, currency, locale, timezone } = data;
    const normalizedEmail = this.normalizeEmail(email);

    if (ipAddress) {
      const ipLimit = await checkRateLimit(getIpRateLimitIdentifier(ipAddress, 'registration'));
      if (!ipLimit.allowed) throw new RateLimitError('Too many registration attempts. Please try again later.', ipLimit.resetTime);
    }

    const accountLimit = await checkRateLimit(getAccountRateLimitIdentifier(normalizedEmail, 'registration'));
    if (!accountLimit.allowed) throw new RateLimitError('Too many registration attempts. Please try again later.', accountLimit.resetTime);

    if (await userRepository.findByEmail(normalizedEmail)) {
      throw new Error('Cette adresse email est déjà utilisée');
    }

    const hashedPassword = await authService.hashPassword(password);
    const result = await prisma.$transaction(async (tx) => {
      const existingOrganization = await tx.organization.findFirst({ orderBy: { createdAt: 'asc' } });
      if (existingOrganization) {
        const user = await tx.user.create({
          data: {
            email: normalizedEmail,
            name,
            password: hashedPassword,
            organizationId: existingOrganization.id,
            isActive: false,
          },
        });
        return { organization: existingOrganization, user, pendingApproval: true };
      }

      const initialOrganizationName = organizationName?.trim();
      if (!initialOrganizationName) throw new Error('Le nom de l’organisation est obligatoire pour la première inscription.');
      const slug = await generateUniqueSlug(initialOrganizationName, async (value) => {
        return Boolean(await tx.organization.findUnique({ where: { slug: value }, select: { id: true } }));
      });
      const organization = await tx.organization.create({
        data: { name: initialOrganizationName, slug, country, currency, locale, timezone },
      });
      const { adminRoleId } = await provisionStandardOrganizationRoles(tx, organization.id);
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          name,
          password: hashedPassword,
          organizationId: organization.id,
          isActive: true,
        },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: adminRoleId } });
      return { organization, user, pendingApproval: false };
    }, { isolationLevel: 'Serializable' });

    if (result.pendingApproval) {
      return {
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          organizationId: result.organization.id,
          organizationName: result.organization.name,
        },
        token: null,
        expiresAt: null,
        pendingApproval: true,
      };
    }

    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await sessionRepository.create({
      user: { connect: { id: result.user.id } },
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
      pendingApproval: false,
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }
}

export const registrationService = new RegistrationService();
