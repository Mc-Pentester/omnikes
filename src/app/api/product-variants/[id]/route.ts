import { NextRequest, NextResponse } from 'next/server';
import { productVariantService } from '@omnikes/services/product-variant.service';

// Helper function to get organizationId from request
// TODO: Replace with proper authentication system
function getOrganizationId(request: NextRequest): string {
  const orgId = request.headers.get('x-organization-id');
  if (!orgId) {
    throw new Error('Organization ID header is required');
  }
  return orgId;
}

/**
 * GET /api/product-variants/[id]
 * Get a single product variant
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = getOrganizationId(request);
    const variant = await productVariantService.getById(id, organizationId);

    return NextResponse.json(variant);
  } catch (error) {
    if (error instanceof Error && error.message === 'Organization ID header is required') {
      return NextResponse.json(
        { error: 'Organization ID header is required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === 'Product variant not found or access denied') {
      return NextResponse.json(
        { error: 'Product variant not found or access denied' },
        { status: 404 }
      );
    }
    
    console.error('Error getting variant:', error);
    return NextResponse.json(
      { error: 'Failed to get variant' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/product-variants/[id]
 * Update a product variant
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = getOrganizationId(request);
    const body = await request.json();

    const variant = await productVariantService.update(id, organizationId, body);

    return NextResponse.json(variant);
  } catch (error) {
    if (error instanceof Error && error.message === 'Organization ID header is required') {
      return NextResponse.json(
        { error: 'Organization ID header is required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === 'Product variant not found or access denied') {
      return NextResponse.json(
        { error: 'Product variant not found or access denied' },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message === 'SKU already exists') {
      return NextResponse.json(
        { error: 'SKU already exists' },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    console.error('Error updating variant:', error);
    return NextResponse.json(
      { error: 'Failed to update variant' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/product-variants/[id]
 * Deactivate a product variant (soft delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = getOrganizationId(request);
    const variant = await productVariantService.deactivate(id, organizationId);

    return NextResponse.json(variant);
  } catch (error) {
    if (error instanceof Error && error.message === 'Organization ID header is required') {
      return NextResponse.json(
        { error: 'Organization ID header is required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === 'Product variant not found or access denied') {
      return NextResponse.json(
        { error: 'Product variant not found or access denied' },
        { status: 404 }
      );
    }
    
    console.error('Error deactivating variant:', error);
    return NextResponse.json(
      { error: 'Failed to deactivate variant' },
      { status: 500 }
    );
  }
}
