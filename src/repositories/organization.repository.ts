import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

export class OrganizationRepository {
  /**
   * Create a new organization
   */
  async create(data: Prisma.OrganizationCreateInput) {
    return prisma.organization.create({
      data,
    });
  }

  /**
   * Find an organization by slug
   */
  async findBySlug(slug: string) {
    return prisma.organization.findUnique({
      where: { slug },
    });
  }

  /**
   * Check if an organization with the given slug exists
   */
  async slugExists(slug: string): Promise<boolean> {
    const org = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });
    return !!org;
  }
}

export const organizationRepository = new OrganizationRepository();
