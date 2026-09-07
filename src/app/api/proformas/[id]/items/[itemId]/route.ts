import { NextRequest, NextResponse } from 'next/server';
import { proformaService } from '@omnikes/services/proforma.service';

function getOrganizationId(request: NextRequest): string {
  const orgId = request.headers.get('x-organization-id');
  if (!orgId) {
    throw new Error('Organization ID header is required');
  }
  return orgId;
}

/**
 * PATCH /api/proformas/[id]/items/[itemId]
 * Update a proforma item
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const organizationId = getOrganizationId(request);
    const body = await request.json();

    const item = await proformaService.updateItem(itemId, organizationId, body);

    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof Error && error.message === 'Organization ID header is required') {
      return NextResponse.json(
        { error: 'Organization ID header is required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === 'Proforma item not found or access denied') {
      return NextResponse.json(
        { error: 'Proforma item not found or access denied' },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message === 'Only DRAFT proformas can be modified') {
      return NextResponse.json(
        { error: 'Only DRAFT proformas can be modified' },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    console.error('Error updating item:', error);
    return NextResponse.json(
      { error: 'Failed to update item' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/proformas/[id]/items/[itemId]
 * Remove a proforma item
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const organizationId = getOrganizationId(request);

    await proformaService.removeItem(itemId, organizationId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Organization ID header is required') {
      return NextResponse.json(
        { error: 'Organization ID header is required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === 'Proforma item not found or access denied') {
      return NextResponse.json(
        { error: 'Proforma item not found or access denied' },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message === 'Only DRAFT proformas can be modified') {
      return NextResponse.json(
        { error: 'Only DRAFT proformas can be modified' },
        { status: 409 }
      );
    }
    
    console.error('Error removing item:', error);
    return NextResponse.json(
      { error: 'Failed to remove item' },
      { status: 500 }
    );
  }
}
