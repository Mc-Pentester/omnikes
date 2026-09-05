import { NextRequest, NextResponse } from 'next/server';
import { productService } from '@omnikes/services/product.service';
import { productSchema } from '@omnikes/lib/validation';

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
 * GET /api/products
 * List products for an organization
 */
export async function GET(request: NextRequest) {
  try {
    const organizationId = getOrganizationId(request);
    const { searchParams } = new URL(request.url);
    
    const search = searchParams.get('search') || undefined;
    const category = searchParams.get('category') || undefined;
    const isActive = searchParams.get('isActive') === 'true' ? true : 
                     searchParams.get('isActive') === 'false' ? false : undefined;
    const skip = parseInt(searchParams.get('skip') || '0');
    const take = parseInt(searchParams.get('take') || '50');

    const result = await productService.list(organizationId, {
      search,
      category,
      isActive,
      skip,
      take,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Organization ID header is required') {
      return NextResponse.json(
        { error: 'Organization ID header is required' },
        { status: 401 }
      );
    }
    
    console.error('Error listing products:', error);
    return NextResponse.json(
      { error: 'Failed to list products' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/products
 * Create a new product
 */
export async function POST(request: NextRequest) {
  try {
    const organizationId = getOrganizationId(request);
    const body = await request.json();

    const result = await productService.create(organizationId, body);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Organization ID header is required') {
      return NextResponse.json(
        { error: 'Organization ID header is required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    console.error('Error creating product:', error);
    return NextResponse.json(
      { error: 'Failed to create product' },
      { status: 500 }
    );
  }
}
