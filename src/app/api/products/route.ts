import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { productService } from '@omnikes/services/product.service';
import { productSchema, productVariantSchema } from '@omnikes/lib/validation';
import { requireCurrentOrganizationId, requirePermission, getAuthorizedStoreIds, requireSubscriptionCapability } from '@omnikes/lib/auth';
import { validatePagination } from '@omnikes/lib/pagination';

const productCreateRequestSchema = productSchema.extend({
  variants: z.array(productVariantSchema.omit({ productId: true }).extend({
    cost: productVariantSchema.shape.cost.default(0),
  })).optional(),
  initialStock: z.object({
    storeId: z.string().cuid(),
    quantity: z.number().int().min(0).max(1000000000),
  }).optional(),
}).superRefine((data, ctx) => {
  if (data.initialStock && data.initialStock.quantity > 0 && (!data.variants || data.variants.length === 0)) {
    ctx.addIssue({ code: 'custom', path: ['variants'], message: 'At least one variant is required for initial stock' });
  }
});

export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'product.read');
    const { searchParams } = new URL(request.url);
    const barcode = searchParams.get('barcode');
    if (barcode !== null) {
      const product = await productService.getByBarcode(organizationId, barcode);
      return product ? NextResponse.json({ product }) : NextResponse.json({ error: 'Barcode not found' }, { status: 404 });
    }
    const search = searchParams.get('search') || undefined;
    const category = searchParams.get('category') || undefined;
    const isActive = searchParams.get('isActive') === 'true' ? true :
                     searchParams.get('isActive') === 'false' ? false : undefined;
    const { skip, take } = validatePagination(searchParams.get('skip'), searchParams.get('take'));
    const authorizedStoreIds = await getAuthorizedStoreIds(request);
    const result = await productService.list(organizationId, { search, category, isActive, authorizedStoreIds, skip, take });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Subscription entitlement required:')) return NextResponse.json({ error: error.message }, { status: 402 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    if (error instanceof Error) {
      if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      if (error.message.startsWith('Permission required')) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
      if (error.message.includes('Invalid skip') || error.message.includes('Invalid take')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    console.error('Error listing products:', error);
    return NextResponse.json({ error: 'Failed to list products' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'product.manage');
    await requireSubscriptionCapability(request, 'inventory.core', 'WRITE');
    const body = await request.json();
    const validatedData = productCreateRequestSchema.parse({ ...body, organizationId });
    const { initialStock, ...productData } = validatedData;
    const result = await productService.create(organizationId, productData, initialStock);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Subscription entitlement required:')) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data', details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('Permission required')) {
      return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    }
    if (error instanceof Error && error.message.startsWith('Initial stock')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && 'code' in error && error.code === 'P2002') return NextResponse.json({ error: 'SKU or barcode already exists' }, { status: 409 });
    console.error('Error creating product:', error);
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}
