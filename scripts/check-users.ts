import { prisma } from '../src/lib/prisma';

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      organizationId: true,
      isActive: true,
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  console.log('=== USERS IN DATABASE ===');
  console.log(JSON.stringify(users, null, 2));

  const organizations = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
    },
  });

  console.log('\n=== ORGANIZATIONS IN DATABASE ===');
  console.log(JSON.stringify(organizations, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
