import { NextRequest, NextResponse } from 'next/server';
import { productService } from '@omnikes/services/product.service';
import { requireCurrentOrganizationId, requirePermission } from '@omnikes/lib/auth';

/**
 * POST /api/products/[id]/activate
 * Activate a product
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'product.manage');

    const product = await productService.activate(id, organizationId);

    return NextResponse.json(product);
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && (error.message === 'Permission required: product.manage' || error.message.startsWith('Permission required'))) {
      return NextResponse.json(
        { error: 'Permission required' },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.message === 'Product not found or access denied') {
      return NextResponse.json(
        { error: 'Product not found or access denied' },
        { status: 404 }
      );
    }

    console.error('Error activating product:', error);
    return NextResponse.json(
      { error: 'Failed to activate product' },
      { status: 500 }
    );
  }
}
