import { NextRequest, NextResponse } from 'next/server';
import { proformaService } from '@omnikes/services/proforma.service';
import { requireCurrentOrganizationId, requireStoreAccess, requirePermission } from '@omnikes/lib/auth';

/**
 * GET /api/proformas/[id]/items
 * List items for a proforma
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'proforma.read');

    const proforma = await proformaService.getById(id, organizationId);

    // Check store access
    if (proforma.storeId) {
      await requireStoreAccess(request, proforma.storeId);
    }

    return NextResponse.json(proforma.items);
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === 'Proforma not found or access denied') {
      return NextResponse.json(
        { error: 'Proforma not found or access denied' },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message === 'Not authorized to access this store') {
      return NextResponse.json(
        { error: 'Not authorized to access this store' },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.message.startsWith('Permission required')) {
      return NextResponse.json(
        { error: 'Permission required' },
        { status: 403 }
      );
    }

    console.error('Error listing items:', error);
    return NextResponse.json(
      { error: 'Failed to list items' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/proformas/[id]/items
 * Add an item to a proforma
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'proforma.update');

    const body = await request.json();

    // Get proforma first to check store access
    const existingProforma = await proformaService.getById(id, organizationId);
    if (existingProforma.storeId) {
      await requireStoreAccess(request, existingProforma.storeId);
    }

    const item = await proformaService.addItem(id, organizationId, body);

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === 'Proforma not found or access denied') {
      return NextResponse.json(
        { error: 'Proforma not found or access denied' },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message === 'Not authorized to access this store') {
      return NextResponse.json(
        { error: 'Not authorized to access this store' },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.message.startsWith('Permission required')) {
      return NextResponse.json(
        { error: 'Permission required' },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.message === 'Only DRAFT proformas can be modified') {
      return NextResponse.json(
        { error: 'Only DRAFT proformas can be modified' },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message === 'Product variant not found or access denied') {
      return NextResponse.json(
        { error: 'Product variant not found or access denied' },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    console.error('Error adding item:', error);
    return NextResponse.json(
      { error: 'Failed to add item' },
      { status: 500 }
    );
  }
}
