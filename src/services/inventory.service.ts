import { inventoryRepository } from '@omnikes/repositories/inventory.repository';
import { inventoryMovementSchema, InventoryMovementInput } from '@omnikes/lib/validation';
import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

export type MovementType = 'SALE' | 'PURCHASE' | 'ADJUSTMENT' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'RETURN';

export class InventoryService {
  /**
   * Get inventory by ID with organization check
   */
  async getById(id: string, organizationId: string) {
    const inventory = await inventoryRepository.findById(id, organizationId);
    
    if (!inventory) {
      throw new Error('Inventory not found or access denied');
    }

    return inventory;
  }

  /**
   * Get inventory for a store and variant
   */
  async getByStoreAndVariant(storeId: string, variantId: string, organizationId: string) {
    const inventory = await inventoryRepository.findByStoreAndVariant(storeId, variantId, organizationId);
    
    if (!inventory) {
      throw new Error('Inventory not found or access denied');
    }

    return inventory;
  }

  /**
   * List inventories for a store
   */
  async listByStore(storeId: string, organizationId: string, options: {
    skip?: number;
    take?: number;
  } = {}) {
    return inventoryRepository.listByStore(storeId, organizationId, options);
  }

  /**
   * List inventories for an organization
   */
  async listByOrganization(organizationId: string, options: {
    storeId?: string;
    skip?: number;
    take?: number;
  } = {}) {
    return inventoryRepository.listByOrganization(organizationId, options);
  }

  /**
   * Get available quantity for a variant in a store
   */
  async getAvailableQuantity(storeId: string, variantId: string, organizationId: string) {
    return inventoryRepository.getAvailableQuantity(storeId, variantId, organizationId);
  }

  /**
   * Check availability
   */
  async checkAvailability(storeId: string, variantId: string, quantity: number, organizationId: string): Promise<boolean> {
    const available = await this.getAvailableQuantity(storeId, variantId, organizationId);
    return available >= quantity;
  }

  /**
   * Create a stock movement with transaction
   * This handles concurrency and stock integrity
   */
  async createMovement(inventoryId: string, organizationId: string, data: InventoryMovementInput) {
    // Validate input
    const validatedData = inventoryMovementSchema.parse(data);

    // Check if inventory belongs to organization
    const belongs = await inventoryRepository.belongsToOrganization(inventoryId, organizationId);
    if (!belongs) {
      throw new Error('Inventory not found or access denied');
    }

    // Use transaction for atomic operation
    return prisma.$transaction(async () => {
      // Get current inventory state with FOR UPDATE lock
      const inventory = await prisma.$queryRaw`
        SELECT "quantity", "reservedQuantity" 
        FROM "inventories" 
        WHERE "id" = ${inventoryId}
        FOR UPDATE
      ` as any;

      if (!inventory || inventory.length === 0) {
        throw new Error('Inventory not found');
      }

      const currentInventory = inventory[0];

      // Calculate new quantity based on movement type
      let newQuantity = currentInventory.quantity;
      const { type, quantity } = validatedData;

      switch (type) {
        case 'PURCHASE':
        case 'TRANSFER_IN':
        case 'RETURN':
          newQuantity = currentInventory.quantity + Math.abs(quantity);
          break;
        case 'SALE':
        case 'TRANSFER_OUT':
          newQuantity = currentInventory.quantity - Math.abs(quantity);
          // Prevent negative stock
          if (newQuantity < 0) {
            throw new Error('Insufficient stock for this operation');
          }
          break;
        case 'ADJUSTMENT':
          newQuantity = quantity;
          break;
        default:
          throw new Error('Invalid movement type');
      }

      // Update inventory
      await prisma.inventory.update({
        where: { id: inventoryId },
        data: { quantity: newQuantity },
      });

      // Create movement record
      const movement = await prisma.inventoryMovement.create({
        data: {
          inventoryId,
          type: validatedData.type,
          quantity: validatedData.quantity,
          referenceId: validatedData.referenceId,
          referenceType: validatedData.referenceType,
          notes: validatedData.notes,
        },
        include: {
          inventory: {
            include: {
              store: true,
              variant: {
                include: {
                  product: true,
                },
              },
            },
          },
        },
      });

      return movement;
    });
  }

  /**
   * List movements for an inventory
   */
  async listMovements(inventoryId: string, organizationId: string, options: {
    type?: string;
    skip?: number;
    take?: number;
  } = {}) {
    // Check if inventory belongs to organization
    const belongs = await inventoryRepository.belongsToOrganization(inventoryId, organizationId);
    if (!belongs) {
      throw new Error('Inventory not found or access denied');
    }

    return inventoryRepository.listMovements(inventoryId, organizationId, options);
  }

  /**
   * Reserve stock (for orders, etc.)
   */
  async reserveStock(inventoryId: string, quantity: number, organizationId: string) {
    if (quantity <= 0) {
      throw new Error('Quantity must be positive');
    }

    return prisma.$transaction(async () => {
      const inventory = await prisma.$queryRaw`
        SELECT "quantity", "reservedQuantity" 
        FROM "inventories" 
        WHERE "id" = ${inventoryId}
        FOR UPDATE
      ` as any;

      if (!inventory || inventory.length === 0) {
        throw new Error('Inventory not found');
      }

      const currentInventory = inventory[0];
      const available = currentInventory.quantity - currentInventory.reservedQuantity;
      if (available < quantity) {
        throw new Error('Insufficient available stock');
      }

      await prisma.inventory.update({
        where: { id: inventoryId },
        data: {
          reservedQuantity: currentInventory.reservedQuantity + quantity,
        },
      });

      return inventoryRepository.findById(inventoryId, organizationId);
    });
  }

  /**
   * Release reserved stock
   */
  async releaseReservedStock(inventoryId: string, quantity: number, organizationId: string) {
    if (quantity <= 0) {
      throw new Error('Quantity must be positive');
    }

    return prisma.$transaction(async () => {
      const inventory = await prisma.$queryRaw`
        SELECT "reservedQuantity" 
        FROM "inventories" 
        WHERE "id" = ${inventoryId}
        FOR UPDATE
      ` as any;

      if (!inventory || inventory.length === 0) {
        throw new Error('Inventory not found');
      }

      const currentInventory = inventory[0];
      if (currentInventory.reservedQuantity < quantity) {
        throw new Error('Cannot release more than reserved');
      }

      await prisma.inventory.update({
        where: { id: inventoryId },
        data: {
          reservedQuantity: Math.max(0, currentInventory.reservedQuantity - quantity),
        },
      });

      return inventoryRepository.findById(inventoryId, organizationId);
    });
  }

  /**
   * Adjust inventory quantity (manual adjustment)
   */
  async adjustQuantity(inventoryId: string, newQuantity: number, organizationId: string, notes?: string) {
    if (newQuantity < 0) {
      throw new Error('Quantity cannot be negative');
    }

    return prisma.$transaction(async () => {
      const inventory = await prisma.$queryRaw`
        SELECT "quantity" 
        FROM "inventories" 
        WHERE "id" = ${inventoryId}
        FOR UPDATE
      ` as any;

      if (!inventory || inventory.length === 0) {
        throw new Error('Inventory not found');
      }

      const currentInventory = inventory[0];
      const difference = newQuantity - currentInventory.quantity;

      await prisma.inventory.update({
        where: { id: inventoryId },
        data: { quantity: newQuantity },
      });

      // Create adjustment movement
      await prisma.inventoryMovement.create({
        data: {
          inventoryId,
          type: 'ADJUSTMENT',
          quantity: difference,
          notes: notes || `Manual adjustment from ${currentInventory.quantity} to ${newQuantity}`,
        },
      });

      return inventoryRepository.findById(inventoryId, organizationId);
    });
  }
}

export const inventoryService = new InventoryService();
