import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { inventoryService } from '@omnikes/services/inventory.service';
import { requireCurrentOrganizationId, requirePermission, requireStoreAccess } from '@omnikes/lib/auth';

function isValidCuid(id: string): boolean {
  return /^[a-z0-9]{24,}$/.test(id);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!isValidCuid(id)) {
      return NextResponse.json({ error: 'Invalid inventory ID format' }, { status: 400 });
    }

    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'inventory.adjust');

    const source = await inventoryService.getById(id, organizationId);
    await requireStoreAccess(request, source.storeId);

    const body = await request.json();
    const data = await import('@omnikes/lib/validation').then(({ inventoryTransferSchema }) =>
      inventoryTransferSchema.parse(body)
    );

    const target = await inventoryService.getById(data.targetInventoryId, organizationId);
    await requireStoreAccess(request, target.storeId);

    const result = await inventoryService.transferInventory(id, organizationId, data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid transfer data', details: error.issues }, { status: 400 });
    }
    if (error instanceof Error) {
      if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      if (error.message.startsWith('Permission required')) {
        return NextResponse.json({ error: 'Permission required' }, { status: 403 });
      }
      if (error.message === 'Not authorized to access this store') {
        return NextResponse.json({ error: 'Not authorized to access this store' }, { status: 403 });
      }
      if (error.message === 'Inventory not found or access denied') {
        return NextResponse.json({ error: 'Inventory not found or access denied' }, { status: 404 });
      }
      if (error.message.includes('Insufficient available stock')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (error.message.includes('same location')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error('Error transferring inventory:', error);
    return NextResponse.json({ error: 'Failed to transfer inventory' }, { status: 500 });
  }
}
