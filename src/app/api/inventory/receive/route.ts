import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentOrganizationId, requirePermission, requireStoreAccess } from '@omnikes/lib/auth';
import { inventoryRepository } from '@omnikes/repositories/inventory.repository';
import { inventoryService } from '@omnikes/services/inventory.service';

const receiptRequestSchema = z.object({
  storeId: z.string().min(1),
  variantId: z.string().min(1),
  quantity: z.number().int().positive(),
  referenceId: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'inventory.adjust');
    const data = receiptRequestSchema.parse(await request.json());

    await requireStoreAccess(request, data.storeId);
    const inventory = await inventoryRepository.findOrCreate(
      data.storeId,
      data.variantId,
      organizationId,
    );

    const result = await inventoryService.receiveInventory(inventory.id, organizationId, {
      quantity: data.quantity,
      referenceId: data.referenceId,
      notes: data.notes,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data', details: error.issues }, { status: 400 });
    }
    if (error instanceof Error) {
      if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      if (error.message.startsWith('Permission required') || error.message === 'Not authorized to access this store') {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      if (error.message === 'Store or product variant not found or access denied') {
        return NextResponse.json({ error: 'Store or product variant not found or access denied' }, { status: 404 });
      }
    }
    console.error('Inventory initial receipt error:', error);
    return NextResponse.json({ error: 'Failed to receive inventory' }, { status: 500 });
  }
}
