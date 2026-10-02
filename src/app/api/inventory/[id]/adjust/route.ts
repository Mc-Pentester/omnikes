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
    if (!isValidCuid(id)) return NextResponse.json({ error: 'Invalid inventory ID format' }, { status: 400 });

    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'inventory.adjust');
    const inventory = await inventoryService.getById(id, organizationId);
    await requireStoreAccess(request, inventory.storeId);

    const result = await inventoryService.adjustInventory(
      id,
      organizationId,
      await request.json(),
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request data', details: error.issues }, { status: 400 });
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (error instanceof Error && error.message.startsWith('Permission required')) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    if (error instanceof Error && error.message === 'Not authorized to access this store') return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof Error && error.message === 'Inventory not found or access denied') return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof Error && (error.message === 'Adjusted quantity cannot be below reserved quantity' || error.message === 'No inventory adjustment is required')) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Inventory adjust error:', error);
    return NextResponse.json({ error: 'Failed to adjust inventory' }, { status: 500 });
  }
}
