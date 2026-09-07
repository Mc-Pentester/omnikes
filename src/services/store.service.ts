import { storeRepository } from '@omnikes/repositories/store.repository';
import { storeSchema, StoreInput } from '@omnikes/lib/validation';
import { Prisma } from '@prisma/client';

export class StoreService {
  /**
   * List stores for an organization
   */
  async listStores(organizationId: string, options: {
    isActive?: boolean;
    skip?: number;
    take?: number;
  } = {}) {
    return storeRepository.listByOrganization(organizationId, options);
  }

  /**
   * Get a store by ID with organization check
   */
  async getStore(storeId: string, organizationId: string) {
    const store = await storeRepository.findById(storeId, organizationId);
    
    if (!store) {
      throw new Error('Store not found or access denied');
    }

    return store;
  }

  /**
   * Validate that a store belongs to an organization
   * This is a critical security check for multi-tenant isolation
   */
  async validateStoreBelongsToOrganization(storeId: string, organizationId: string): Promise<void> {
    const belongs = await storeRepository.belongsToOrganization(storeId, organizationId);
    
    if (!belongs) {
      throw new Error('Store not found or does not belong to this organization');
    }
  }

  /**
   * Create a new store with validation
   */
  async create(organizationId: string, data: StoreInput) {
    // Validate input
    const validatedData = storeSchema.parse({
      ...data,
      organizationId,
    });

    return storeRepository.create({
      name: validatedData.name,
      code: validatedData.code,
      address: validatedData.address,
      city: validatedData.city,
      country: validatedData.country,
      phone: validatedData.phone,
      email: validatedData.email,
      isActive: validatedData.isActive,
      organization: {
        connect: { id: organizationId },
      },
    });
  }

  /**
   * Update a store with validation
   */
  async update(storeId: string, organizationId: string, data: Partial<StoreInput>) {
    // Check if store exists and belongs to organization
    const exists = await storeRepository.belongsToOrganization(storeId, organizationId);
    
    if (!exists) {
      throw new Error('Store not found or access denied');
    }

    // Validate input
    const validatedData = storeSchema.partial().parse(data);

    await storeRepository.update(storeId, organizationId, validatedData as Prisma.StoreUpdateInput);
    
    return storeRepository.findById(storeId, organizationId);
  }

  /**
   * Deactivate a store (soft delete)
   */
  async deactivate(storeId: string, organizationId: string) {
    const exists = await storeRepository.belongsToOrganization(storeId, organizationId);
    
    if (!exists) {
      throw new Error('Store not found or access denied');
    }

    await storeRepository.deactivate(storeId, organizationId);
    
    return storeRepository.findById(storeId, organizationId);
  }

  /**
   * Activate a store
   */
  async activate(storeId: string, organizationId: string) {
    const exists = await storeRepository.belongsToOrganization(storeId, organizationId);
    
    if (!exists) {
      throw new Error('Store not found or access denied');
    }

    await storeRepository.activate(storeId, organizationId);
    
    return storeRepository.findById(storeId, organizationId);
  }
}

export const storeService = new StoreService();
