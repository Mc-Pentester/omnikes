import { platformOperatorBootstrapService } from '@omnikes/services/platform-operator-bootstrap.service';
import { PLATFORM_PERMISSIONS } from '@omnikes/lib/rbac/standard-tenant-roles';
import { prisma } from '@omnikes/lib/prisma';

const PLATFORM_ORGANIZATION = {
  name: 'OmniKès technique',
  slug: 'omnikes-platform-technical',
  country: 'HT',
  currency: 'HTG',
  locale: 'fr-HT',
  timezone: 'America/Port-au-Prince',
  cloudEnabled: false,
  onlineStoreEnabled: false,
};

function required(name: string, options: { trim?: boolean } = {}): string {
  const rawValue = process.env[name];
  const value = options.trim === false ? rawValue : rawValue?.trim();
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

async function ensurePlatformOrganization(): Promise<string> {
  // A reserved, deterministic slug makes this operation repeatable. Never
  // repurpose an unrelated organization if that slug is already occupied.
  const organization = await prisma.organization.upsert({
    where: { slug: PLATFORM_ORGANIZATION.slug },
    update: {},
    create: PLATFORM_ORGANIZATION,
    select: { id: true, name: true },
  });

  if (organization.name !== PLATFORM_ORGANIZATION.name) {
    throw new Error('Reserved OmniKès technical organization slug is already used by another organization');
  }

  return organization.id;
}

async function ensurePlatformRoleAndPermissions(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const role = await tx.platformRole.upsert({
      where: { name: 'OMNIKES_PLATFORM_OPERATOR' },
      // Preserve deliberate administrative suspensions during explicit bootstrap.
      update: {
        description: 'Opérateur OmniKès autorisé à gérer les abonnements de la plateforme',
      },
      create: {
        name: 'OMNIKES_PLATFORM_OPERATOR',
        description: 'Opérateur OmniKès autorisé à gérer les abonnements de la plateforme',
        isActive: true,
      },
      select: { id: true, isActive: true },
    });

    if (!role.isActive) {
      throw new Error('Platform operator role is inactive; an administrator must explicitly reactivate it before bootstrap');
    }

    const permissions = [];
    for (const definition of PLATFORM_PERMISSIONS) {
      permissions.push(await tx.platformPermission.upsert({
        where: { code: definition.code },
        update: {},
        create: definition,
        select: { id: true },
      }));
    }

    await tx.platformRolePermission.createMany({
      data: permissions.map((permission) => ({
        platformRoleId: role.id,
        platformPermissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  });
}

async function main() {
  if (process.env.BOOTSTRAP_PLATFORM_OPERATOR !== 'true') {
    throw new Error(
      'Bootstrap disabled. Set BOOTSTRAP_PLATFORM_OPERATOR=true for this explicit one-shot operation.',
    );
  }

  // Validate all inputs before the first database write.
  const email = required('BOOTSTRAP_PLATFORM_OPERATOR_EMAIL').toLowerCase();
  const name = required('BOOTSTRAP_PLATFORM_OPERATOR_NAME');
  // Passwords are opaque secrets: preserve every character, including leading
  // and trailing spaces, so bootstrap and normal login use the same value.
  const password = required('BOOTSTRAP_PLATFORM_OPERATOR_PASSWORD', { trim: false });

  if (!email.includes('@')) throw new Error('BOOTSTRAP_PLATFORM_OPERATOR_EMAIL must be a valid email address');
  if (name.length > 255) throw new Error('BOOTSTRAP_PLATFORM_OPERATOR_NAME must be 255 characters or fewer');
  if (password.length < 8) throw new Error('BOOTSTRAP_PLATFORM_OPERATOR_PASSWORD must be at least 8 characters');

  // Fail closed on a suspended role before creating the internal organization.
  await ensurePlatformRoleAndPermissions();
  const organizationId = await ensurePlatformOrganization();

  const result = await platformOperatorBootstrapService.bootstrap({
    organizationId,
    email,
    name,
    password,
  });

  console.log('Platform operator bootstrap completed.');
  console.log(`User ID: ${result.userId}`);
  console.log(`Email: ${result.email}`);
  console.log(`Organization: ${PLATFORM_ORGANIZATION.name}`);
  console.log(`Organization ID: ${result.organizationId}`);
  console.log(`Platform role: ${result.platformRole}`);
  console.log('');
  console.log('The bootstrap switch and password environment variable must now be removed/disabled.');
  console.log('The operator can authenticate through the normal /api/auth/login flow.');
}

main()
  .catch((error) => {
    console.error('Platform operator bootstrap failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
