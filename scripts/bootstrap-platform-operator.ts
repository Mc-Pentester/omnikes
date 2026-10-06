import { platformOperatorBootstrapService } from '@omnikes/services/platform-operator-bootstrap.service';
import { prisma } from '@omnikes/lib/prisma';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  if (process.env.BOOTSTRAP_PLATFORM_OPERATOR !== 'true') {
    throw new Error(
      'Bootstrap disabled. Set BOOTSTRAP_PLATFORM_OPERATOR=true for this explicit one-shot operation.',
    );
  }

  const result = await platformOperatorBootstrapService.bootstrap({
    organizationId: required('BOOTSTRAP_PLATFORM_OPERATOR_ORGANIZATION_ID'),
    email: required('BOOTSTRAP_PLATFORM_OPERATOR_EMAIL'),
    name: required('BOOTSTRAP_PLATFORM_OPERATOR_NAME'),
    password: required('BOOTSTRAP_PLATFORM_OPERATOR_PASSWORD'),
  });

  console.log('Platform operator bootstrap completed.');
  console.log(`User ID: ${result.userId}`);
  console.log(`Email: ${result.email}`);
  console.log(`Organization ID: ${result.organizationId}`);
  console.log(`Platform role: ${result.platformRole}`);
  console.log('');
  console.log('The bootstrap switch must now be removed/disabled.');
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
