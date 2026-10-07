import { inventoryRepository } from '@omnikes/repositories/inventory.repository';
import {
  inventoryMovementSchema,
  inventoryAdjustmentSchema,
  inventoryReceiptSchema,
  inventoryTransferSchema,
  InventoryMovementInput,
} from '@omnikes/lib/validation';
import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

export type MovementType = 'SALE' | 'PURCHASE' | 'ADJUSTMENT' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'RETURN';

type InventoryTransaction = Prisma.TransactionClient;

const inventoryWithRelations = {
  store: true,
  variant: {
    include: {
      product: true,
    },
  },
} satisfies Prisma.InventoryInclude;

export class InventoryService {
  async getById(id: string, organizationId: string) {
    const inventory = await inventoryRepository.findById(id, organizationId);
    if (!inventory) throw new Error('Inventory not found or access denied');
    return inventory;
  }

  async getByStoreAndVariant(storeId: string, variantId: string, organizationId: string) {
    const inventory = await inventoryRepository.findByStoreAndVariant(storeId, variantId, organizationId);
    if (!inventory) throw new Error('Inventory not found or access denied');
    return inventory;
  }

  async listByStore(storeId: string, organizationId: string, options: { skip?: number; take?: number } = {}) {
    return inventoryRepository.listByStore(storeId, organizationId, options);
  }

  async listByOrganization(organizationId: string, options: { storeId?: string; authorizedStoreIds?: string[] | null; skip?: number; take?: number } = {}) {
    return inventoryRepository.listByOrganization(organizationId, options);
  }

  async getAvailableQuantity(storeId: string, variantId: string, organizationId: string) {
    return inventoryRepository.getAvailableQuantity(storeId, variantId, organizationId);
  }

  async checkAvailability(storeId: string, variantId: string, quantity: number, organizationId: string): Promise<boolean> {
    const available = await this.getAvailableQuantity(storeId, variantId, organizationId);
    return available >= quantity;
  }

  private async getLockedInventory(tx: InventoryTransaction, inventoryId: string, organizationId: string) {
    const rows = await tx.$queryRaw<Array<{ quantity: number; reservedQuantity: number }>>`
      SELECT i."quantity", i."reservedQuantity"
      FROM "inventories" i
      INNER JOIN "stores" s ON s."id" = i."storeId"
      WHERE i."id" = ${inventoryId}
        AND s."organizationId" = ${organizationId}
      FOR UPDATE
    `;
    return rows[0];
  }

  private async getLockedTransferInventories(
    tx: InventoryTransaction,
    sourceId: string,
    targetId: string,
    organizationId: string,
  ) {
    return tx.$queryRaw<Array<{ id: string; variantId: string; quantity: number; reservedQuantity: number }>>`
      SELECT i."id", i."variantId", i."quantity", i."reservedQuantity"
      FROM "inventories" i
      INNER JOIN "stores" s ON s."id" = i."storeId"
      WHERE (i."id" = ${sourceId} OR i."id" = ${targetId})
        AND s."organizationId" = ${organizationId}
      ORDER BY i."id"
      FOR UPDATE
    `;
  }

  private async findInventoryInTransaction(
    tx: InventoryTransaction,
    inventoryId: string,
    organizationId: string,
  ) {
    return tx.inventory.findFirst({
      where: {
        id: inventoryId,
        store: { organizationId },
      },
      include: inventoryWithRelations,
    });
  }

  async createMovement(inventoryId: string, organizationId: string, data: InventoryMovementInput) {
    const validatedData = inventoryMovementSchema.parse(data);

    if (validatedData.quantity === 0) {
      throw new Error('Movement quantity cannot be zero');
    }

    if (validatedData.type !== 'ADJUSTMENT' && validatedData.quantity < 0) {
      throw new Error(`Quantity must be positive for ${validatedData.type} movements`);
    }

    const validTypes: MovementType[] = ['SALE', 'PURCHASE', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN'];
    if (!validTypes.includes(validatedData.type as MovementType)) {
      throw new Error(`Invalid movement type: ${validatedData.type}`);
    }

    const belongs = await inventoryRepository.belongsToOrganization(inventoryId, organizationId);
    if (!belongs) throw new Error('Inventory not found or access denied');

    return prisma.$transaction(async (tx) => {
      const currentInventory = await this.getLockedInventory(tx, inventoryId, organizationId);
      if (!currentInventory) throw new Error('Inventory not found or access denied');

      let newQuantity = currentInventory.quantity;
      const { type, quantity } = validatedData;

      switch (type) {
        case 'PURCHASE':
        case 'TRANSFER_IN':
        case 'RETURN':
          newQuantity = currentInventory.quantity + Math.abs(quantity);
          break;
        case 'SALE':
        case 'TRANSFER_OUT': {
          const available = currentInventory.quantity - currentInventory.reservedQuantity;
          if (available < Math.abs(quantity)) {
            throw new Error('Insufficient available stock');
          }
          newQuantity = currentInventory.quantity - Math.abs(quantity);
          if (newQuantity < 0) throw new Error('Insufficient stock for this operation');
          break;
        }
        case 'ADJUSTMENT':
          newQuantity = currentInventory.quantity + quantity;
          if (newQuantity < 0) throw new Error('Adjustment would result in negative stock');
          if (newQuantity < currentInventory.reservedQuantity) {
            throw new Error('Adjustment cannot reduce stock below reserved quantity');
          }
          break;
        default:
          throw new Error('Invalid movement type');
      }

      await tx.inventory.update({
        where: { id: inventoryId },
        data: { quantity: newQuantity },
      });

      return tx.inventoryMovement.create({
        data: {
          inventoryId,
          type: validatedData.type,
          quantity: validatedData.quantity,
          referenceId: validatedData.referenceId,
          referenceType: validatedData.referenceType,
          notes: validatedData.notes,
        },
        include: { inventory: { include: inventoryWithRelations } },
      });
    });
  }

  async transferInventory(inventoryId: string, organizationId: string, input: unknown) {
    const data = inventoryTransferSchema.parse(input);
    if (inventoryId === data.targetInventoryId) {
      throw new Error('Cannot transfer inventory to the same location');
    }

    const [sourceBelongs, targetBelongs] = await Promise.all([
      inventoryRepository.belongsToOrganization(inventoryId, organizationId),
      inventoryRepository.belongsToOrganization(data.targetInventoryId, organizationId),
    ]);
    if (!sourceBelongs || !targetBelongs) {
      throw new Error('Inventory not found or access denied');
    }

    return prisma.$transaction(async (tx) => {
      const rows = await this.getLockedTransferInventories(
        tx,
        inventoryId,
        data.targetInventoryId,
        organizationId,
      );

      const source = rows.find((row) => row.id === inventoryId);
      const target = rows.find((row) => row.id === data.targetInventoryId);
      if (!source || !target) throw new Error('Inventory not found or access denied');
      if (source.variantId !== target.variantId) {
        throw new Error('Transfer destination must use the same product variant');
      }

      const available = source.quantity - source.reservedQuantity;
      if (available < data.quantity) throw new Error('Insufficient available stock for transfer');

      await tx.inventory.update({
        where: { id: source.id },
        data: { quantity: source.quantity - data.quantity },
      });
      await tx.inventory.update({
        where: { id: target.id },
        data: { quantity: target.quantity + data.quantity },
      });

      const referenceId = data.referenceId || `TRANSFER-${Date.now()}`;
      const [outMovement] = await Promise.all([
        tx.inventoryMovement.create({
          data: {
            inventoryId: source.id,
            type: 'TRANSFER_OUT',
            quantity: data.quantity,
            referenceId,
            referenceType: 'INVENTORY_TRANSFER',
            notes: data.notes,
          },
        }),
        tx.inventoryMovement.create({
          data: {
            inventoryId: target.id,
            type: 'TRANSFER_IN',
            quantity: data.quantity,
            referenceId,
            referenceType: 'INVENTORY_TRANSFER',
            notes: data.notes,
          },
        }),
      ]);

      return {
        referenceId,
        sourceInventoryId: source.id,
        targetInventoryId: target.id,
        quantity: data.quantity,
        outMovement,
      };
    });
  }

  async adjustInventory(inventoryId: string, organizationId: string, input: unknown) {
    const data = inventoryAdjustmentSchema.parse(input);

    const belongs = await inventoryRepository.belongsToOrganization(inventoryId, organizationId);
    if (!belongs) throw new Error('Inventory not found or access denied');

    return prisma.$transaction(async (tx) => {
      const current = await this.getLockedInventory(tx, inventoryId, organizationId);
      if (!current) throw new Error('Inventory not found or access denied');

      if (data.newQuantity < current.reservedQuantity) {
        throw new Error('Adjusted quantity cannot be below reserved quantity');
      }

      const difference = data.newQuantity - current.quantity;
      if (difference === 0) throw new Error('No inventory adjustment is required');

      await tx.inventory.update({
        where: { id: inventoryId },
        data: { quantity: data.newQuantity },
      });

      await tx.inventoryMovement.create({
        data: {
          inventoryId,
          type: 'ADJUSTMENT',
          quantity: difference,
          referenceId: data.referenceId,
          referenceType: 'INVENTORY_ADJUSTMENT',
          notes: [data.reason, data.notes].filter(Boolean).join(' — '),
        },
      });

      return this.findInventoryInTransaction(tx, inventoryId, organizationId);
    });
  }

  async receiveInventory(inventoryId: string, organizationId: string, input: unknown) {
    const data = inventoryReceiptSchema.parse(input);

    const belongs = await inventoryRepository.belongsToOrganization(inventoryId, organizationId);
    if (!belongs) throw new Error('Inventory not found or access denied');

    return prisma.$transaction(async (tx) => {
      const current = await this.getLockedInventory(tx, inventoryId, organizationId);
      if (!current) throw new Error('Inventory not found or access denied');

      await tx.inventory.update({
        where: { id: inventoryId },
        data: { quantity: current.quantity + data.quantity },
      });

      await tx.inventoryMovement.create({
        data: {
          inventoryId,
          type: 'PURCHASE',
          quantity: data.quantity,
          referenceId: data.referenceId,
          referenceType: 'INVENTORY_RECEIPT',
          notes: data.notes,
        },
      });

      return this.findInventoryInTransaction(tx, inventoryId, organizationId);
    });
  }

  async listMovements(
    inventoryId: string,
    organizationId: string,
    options: { type?: string; skip?: number; take?: number } = {},
  ) {
    const belongs = await inventoryRepository.belongsToOrganization(inventoryId, organizationId);
    if (!belongs) throw new Error('Inventory not found or access denied');
    return inventoryRepository.listMovements(inventoryId, organizationId, options);
  }

  async reserveStock(inventoryId: string, quantity: number, organizationId: string) {
    if (quantity <= 0) throw new Error('Quantity must be positive');

    return prisma.$transaction(async (tx) => {
      const current = await this.getLockedInventory(tx, inventoryId, organizationId);
      if (!current) throw new Error('Inventory not found or access denied');

      const available = current.quantity - current.reservedQuantity;
      if (available < quantity) throw new Error('Insufficient available stock');

      await tx.inventory.update({
        where: { id: inventoryId },
        data: { reservedQuantity: current.reservedQuantity + quantity },
      });

      return this.findInventoryInTransaction(tx, inventoryId, organizationId);
    });
  }

  async releaseReservedStock(inventoryId: string, quantity: number, organizationId: string) {
    if (quantity <= 0) throw new Error('Quantity must be positive');

    return prisma.$transaction(async (tx) => {
      const current = await tx.$queryRaw<Array<{ reservedQuantity: number }>>`
        SELECT i."reservedQuantity"
        FROM "inventories" i
        INNER JOIN "stores" s ON s."id" = i."storeId"
        WHERE i."id" = ${inventoryId}
          AND s."organizationId" = ${organizationId}
        FOR UPDATE
      `;
      if (!current[0]) throw new Error('Inventory not found or access denied');

      if (current[0].reservedQuantity < quantity) {
        throw new Error('Cannot release more than reserved');
      }

      await tx.inventory.update({
        where: { id: inventoryId },
        data: { reservedQuantity: current[0].reservedQuantity - quantity },
      });

      return this.findInventoryInTransaction(tx, inventoryId, organizationId);
    });
  }

  async adjustQuantity(inventoryId: string, newQuantity: number, organizationId: string, notes?: string) {
    if (newQuantity < 0) throw new Error('Quantity cannot be negative');

    return prisma.$transaction(async (tx) => {
      const current = await this.getLockedInventory(tx, inventoryId, organizationId);
      if (!current) throw new Error('Inventory not found or access denied');

      if (newQuantity < current.reservedQuantity) {
        throw new Error('Adjusted quantity cannot be below reserved quantity');
      }

      const difference = newQuantity - current.quantity;
      if (difference === 0) throw new Error('No inventory adjustment is required');

      await tx.inventory.update({
        where: { id: inventoryId },
        data: { quantity: newQuantity },
      });

      await tx.inventoryMovement.create({
        data: {
          inventoryId,
          type: 'ADJUSTMENT',
          quantity: difference,
          notes: notes || `Manual adjustment from ${current.quantity} to ${newQuantity}`,
        },
      });

      return this.findInventoryInTransaction(tx, inventoryId, organizationId);
    });
  }
}

export const inventoryService = new InventoryService();
