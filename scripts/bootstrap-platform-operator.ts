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

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function ensurePlatformOrganization(): Promise<string> {
  // A reserved, deterministic slug makes this operation repeatable. Never
  // repurpose an unrelated organization if that slug is already occupied.
  const existing = await prisma.organization.findUnique({
    where: { slug: PLATFORM_ORGANIZATION.slug },
    select: { id: true, name: true },
  });

  if (existing && existing.name !== PLATFORM_ORGANIZATION.name) {
    throw new Error('Reserved OmniKès technical organization slug is already used by another organization');
  }

  const organization = existing ?? await prisma.organization.create({
    data: PLATFORM_ORGANIZATION,
    select: { id: true },
  });

  return organization.id;
}

async function ensurePlatformRoleAndPermissions(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const role = await tx.platformRole.upsert({
      where: { name: 'OMNIKES_PLATFORM_OPERATOR' },
      update: {
        description: 'Opérateur OmniKès autorisé à gérer les abonnements de la plateforme',
        isActive: true,
      },
      create: {
        name: 'OMNIKES_PLATFORM_OPERATOR',
        description: 'Opérateur OmniKès autorisé à gérer les abonnements de la plateforme',
        isActive: true,
      },
      select: { id: true },
    });

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

  const organizationId = await ensurePlatformOrganization();
  await ensurePlatformRoleAndPermissions();

  const result = await platformOperatorBootstrapService.bootstrap({
    organizationId,
    email: required('BOOTSTRAP_PLATFORM_OPERATOR_EMAIL'),
    name: required('BOOTSTRAP_PLATFORM_OPERATOR_NAME'),
    password: required('BOOTSTRAP_PLATFORM_OPERATOR_PASSWORD'),
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
