import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validatePagination } from '@omnikes/lib/pagination';
import { productVariantService } from '@omnikes/services/product-variant.service';
import { requireCurrentOrganizationId, requirePermission } from '@omnikes/lib/auth';
import { productVariantSchema } from '@omnikes/lib/validation';

/**
 * GET /api/products/[id]/variants
 * List variants for a product
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'product.read');
    const { searchParams } = new URL(request.url);

    const isActive = searchParams.get('isActive') === 'true' ? true :
                     searchParams.get('isActive') === 'false' ? false : undefined;
    const { skip, take } = validatePagination(searchParams.get('skip'), searchParams.get('take'));

    const result = await productVariantService.listByProduct(id, organizationId, {
      isActive,
      skip,
      take,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message.startsWith('Permission required')) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.message === 'Product not found or access denied') {
      return NextResponse.json(
        { error: 'Product not found or access denied' },
        { status: 404 }
      );
    }

    console.error('Error listing variants:', error);
    return NextResponse.json(
      { error: 'Failed to list variants' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/products/[id]/variants
 * Create a new variant for a product
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'product.manage');
    const body = await request.json();
    const validatedData = productVariantSchema.omit({ productId: true }).parse(body);

    const result = await productVariantService.create(id, organizationId, validatedData);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message.startsWith('Permission required')) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.message === 'Product not found or access denied') {
      return NextResponse.json(
        { error: 'Product not found or access denied' },
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

    console.error('Error creating variant:', error);
    return NextResponse.json(
      { error: 'Failed to create variant' },
      { status: 500 }
    );
  }
}
