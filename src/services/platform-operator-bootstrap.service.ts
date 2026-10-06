import { Prisma } from '@prisma/client';
import { prisma } from '@omnikes/lib/prisma';
import { authService } from '@omnikes/services/auth.service';

export const PLATFORM_OPERATOR_ROLE = 'OMNIKES_PLATFORM_OPERATOR';

export interface BootstrapPlatformOperatorInput {
  organizationId: string;
  email: string;
  name: string;
  password: string;
}

export interface BootstrapPlatformOperatorResult {
  userId: string;
  organizationId: string;
  email: string;
  platformRole: string;
}

/**
 * Explicit one-shot bootstrap of the first platform operator.
 *
 * This is intentionally not an HTTP endpoint. The bootstrap is an
 * administrator-operated local process and must be enabled explicitly.
 */
export class PlatformOperatorBootstrapService {
  async bootstrap(input: BootstrapPlatformOperatorInput): Promise<BootstrapPlatformOperatorResult> {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();

    if (!input.organizationId) throw new Error('organizationId is required');
    if (!email || !email.includes('@')) throw new Error('A valid email is required');
    if (!name || name.length > 255) throw new Error('A valid name is required');
    if (input.password.length < 8) throw new Error('Password must be at least 8 characters');

    const password = await authService.hashPassword(input.password);

    try {
      return await prisma.$transaction(
        async (tx) => {
          // PostgreSQL transaction-scoped advisory lock serializes bootstrap
          // attempts even when two local processes start simultaneously.
          await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(81427361)`);

          const activeOperator = await tx.platformUserRole.findFirst({
            where: {
              platformRole: {
                name: PLATFORM_OPERATOR_ROLE,
                isActive: true,
              },
              user: {
                isActive: true,
              },
            },
            select: { id: true },
          });

          if (activeOperator) {
            throw new Error('Platform operator bootstrap has already been completed');
          }

          const organization = await tx.organization.findUnique({
            where: { id: input.organizationId },
            select: { id: true },
          });

          if (!organization) throw new Error('Organization not found');

          const existingUser = await tx.user.findUnique({
            where: { email },
            select: { id: true },
          });

          if (existingUser) {
            throw new Error('A user with this email already exists; bootstrap will not modify an existing user');
          }

          const platformRole = await tx.platformRole.findUnique({
            where: { name: PLATFORM_OPERATOR_ROLE },
            select: { id: true, isActive: true },
          });

          if (!platformRole || !platformRole.isActive) {
            throw new Error('Platform operator role is not configured or is inactive');
          }

          const user = await tx.user.create({
            data: {
              organizationId: organization.id,
              email,
              name,
              password,
              isActive: true,
              platformUserRoles: {
                create: {
                  platformRoleId: platformRole.id,
                },
              },
            },
            select: {
              id: true,
              email: true,
              organizationId: true,
            },
          });

          await tx.auditLog.create({
            data: {
              userId: user.id,
              organizationId: user.organizationId,
              action: 'PLATFORM_OPERATOR_BOOTSTRAPPED',
              module: 'platform-auth',
              entityId: user.id,
              entityType: 'User',
              metadata: {
                authorizationScope: 'PLATFORM',
                role: PLATFORM_OPERATOR_ROLE,
                bootstrap: true,
              },
            },
          });

          return {
            userId: user.id,
            organizationId: user.organizationId,
            email: user.email,
            platformRole: PLATFORM_OPERATOR_ROLE,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        throw new Error('Platform operator bootstrap could not create a unique user; verify the email and retry');
      }
      throw error;
    }
  }
}

export const platformOperatorBootstrapService = new PlatformOperatorBootstrapService();
