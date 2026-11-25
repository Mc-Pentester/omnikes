import { prisma } from '@omnikes/lib/prisma';
import { storeSchema, StoreInput } from '@omnikes/lib/validation';
import { roleRepository } from '@omnikes/repositories/role.repository';
import { storeRepository } from '@omnikes/repositories/store.repository';

export class AdminStoreService {
  private async requireGlobalStoreAdmin(actorUserId: string, permission: string) {
    const allowed = await roleRepository.hasGlobalRoleWithPermission(actorUserId, permission);
    if (!allowed) {
      throw new Error('Global store administration required');
    }
  }

  async list(organizationId: string, actorUserId: string) {
    await this.requireGlobalStoreAdmin(actorUserId, 'store.read');

    const stores = await prisma.store.findMany({
      where: { organizationId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        city: true,
        country: true,
        phone: true,
        email: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { inventories: true, sales: true, proformas: true } },
      },
    });

    return stores;
  }

  async create(organizationId: string, actorUserId: string, input: StoreInput) {
    await this.requireGlobalStoreAdmin(actorUserId, 'store.create');
    const data = storeSchema.parse({ ...input, organizationId });

    const duplicate = await storeRepository.findByCode(data.code, organizationId);
    if (duplicate) throw new Error('A store with this code already exists');

    const store = await storeRepository.create({
      name: data.name,
      code: data.code,
      address: data.address,
      city: data.city,
      country: data.country,
      phone: data.phone,
      email: data.email,
      isActive: data.isActive,
      organization: { connect: { id: organizationId } },
    });

    await prisma.auditLog.create({
      data: {
        userId: actorUserId,
        organizationId,
        storeId: store.id,
        action: 'STORE_CREATED',
        module: 'stores',
        entityId: store.id,
        entityType: 'Store',
        newValues: { name: store.name, code: store.code, isActive: store.isActive },
      },
    });

    return store;
  }

  async update(
    organizationId: string,
    actorUserId: string,
    storeId: string,
    input: Partial<StoreInput>,
  ) {
    await this.requireGlobalStoreAdmin(actorUserId, 'store.update');

    const existing = await storeRepository.findById(storeId, organizationId);
    if (!existing) throw new Error('Store not found or access denied');

    const data = storeSchema.partial().omit({ organizationId: true }).parse(input);

    if (data.code && data.code !== existing.code) {
      const duplicate = await storeRepository.findByCode(data.code, organizationId);
      if (duplicate && duplicate.id !== storeId) {
        throw new Error('A store with this code already exists');
      }
    }

    await storeRepository.update(storeId, organizationId, data);
    const updated = await storeRepository.findById(storeId, organizationId);
    if (!updated) throw new Error('Store not found or access denied');

    await prisma.auditLog.create({
      data: {
        userId: actorUserId,
        organizationId,
        storeId,
        action: 'STORE_UPDATED',
        module: 'stores',
        entityId: storeId,
        entityType: 'Store',
        oldValues: {
          name: existing.name,
          code: existing.code,
          isActive: existing.isActive,
        },
        newValues: {
          name: updated.name,
          code: updated.code,
          isActive: updated.isActive,
        },
      },
    });

    return updated;
  }

  async setActive(
    organizationId: string,
    actorUserId: string,
    storeId: string,
    isActive: boolean,
  ) {
    await this.requireGlobalStoreAdmin(actorUserId, isActive ? 'store.activate' : 'store.deactivate');

    const existing = await storeRepository.findById(storeId, organizationId);
    if (!existing) throw new Error('Store not found or access denied');

    if (isActive) {
      await storeRepository.activate(storeId, organizationId);
    } else {
      await storeRepository.deactivate(storeId, organizationId);
    }

    const updated = await storeRepository.findById(storeId, organizationId);
    if (!updated) throw new Error('Store not found or access denied');

    await prisma.auditLog.create({
      data: {
        userId: actorUserId,
        organizationId,
        storeId,
        action: isActive ? 'STORE_ACTIVATED' : 'STORE_DEACTIVATED',
        module: 'stores',
        entityId: storeId,
        entityType: 'Store',
        oldValues: { isActive: existing.isActive },
        newValues: { isActive: updated.isActive },
      },
    });

    return updated;
  }
}

export const adminStoreService = new AdminStoreService();
