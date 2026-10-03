import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentOrganizationId, requirePermission } from '@omnikes/lib/auth';
import { inventoryRepository } from '@omnikes/repositories/inventory.repository';
import { productRepository } from '@omnikes/repositories/product.repository';
import { storeRepository } from '@omnikes/repositories/store.repository';

/**
 * POST /api/admin/init-inventory
 * Initialize inventory entries for all products and stores
 * This is a temporary endpoint to fix missing inventory for existing products
 */
export async function POST(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'inventory.adjust');

    // Get all active stores
    const storesResult = await storeRepository.listByOrganization(organizationId, { isActive: true });
    const stores = storesResult.stores;

    // Get all products with variants
    const productsResult = await productRepository.listByOrganization(organizationId, { isActive: true });
    const products = productsResult.products;

    let createdCount = 0;
    let existingCount = 0;

    for (const store of stores) {
      for (const product of products) {
        if (product.variants && product.variants.length > 0) {
          for (const variant of product.variants) {
            const inventory = await inventoryRepository.findOrCreate(store.id, variant.id, organizationId);
            if (inventory) {
              createdCount++;
            } else {
              existingCount++;
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Inventory initialized: ${createdCount} created, ${existingCount} already existed`,
      stores: stores.length,
      products: products.length,
      created: createdCount,
      existing: existingCount,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      if (error.message.startsWith('Permission required')) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
    }

    console.error('Error initializing inventory:', error);
    return NextResponse.json(
      { error: 'Failed to initialize inventory' },
      { status: 500 }
    );
  }
}
