import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { returnService } from '@omnikes/services/return.service';
import { requireCurrentOrganizationId, requirePermission, requireStoreAccess, getAuthenticatedUser } from '@omnikes/lib/auth';
import { returnSchema } from '@omnikes/lib/validation';
import { prisma } from '@omnikes/lib/prisma';
import { idempotencyKeySchema } from '@omnikes/lib/validation';

/**
 * POST /api/sales/[id]/returns
 * Create a return for a sale
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const saleId = id;
    const organizationId = await requireCurrentOrganizationId(request);
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const authenticatedUserId = user.id;

    await requirePermission(request, 'sale.return');

    // Get idempotency key
    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (!idempotencyKey) {
      return NextResponse.json(
        { error: 'Idempotency-Key header is required' },
        { status: 400 }
      );
    }

    const validatedIdempotencyKey = idempotencyKeySchema.safeParse(idempotencyKey);
    if (!validatedIdempotencyKey.success) {
      return NextResponse.json({ error: 'Invalid Idempotency-Key' }, { status: 400 });
    }

    // Parse return data
    const body = await request.json();
    const returnData = returnSchema.parse(body);
    if (returnData.saleId !== saleId) {
      return NextResponse.json(
        { error: 'Sale ID in request body must match the URL' },
        { status: 400 }
      );
    }

    const requestHash = createHash('sha256')
      .update(JSON.stringify({
        saleId: returnData.saleId,
        userId: authenticatedUserId,
        items: [...returnData.items].sort((a, b) => a.saleItemId.localeCompare(b.saleItemId)),
        reason: returnData.reason ?? null,
      }))
      .digest('hex');

    // Fetch sale to verify store access before returning any cached result
    const saleForAccessCheck = await prisma.sale.findFirst({
      where: { id: saleId, organizationId },
      select: { storeId: true, organizationId: true },
    });

    if (!saleForAccessCheck) {
      return NextResponse.json(
        { error: 'Sale not found' },
        { status: 404 }
      );
    }

    // Verify organization
    if (saleForAccessCheck.organizationId !== organizationId) {
      return NextResponse.json(
        { error: 'Sale not found or access denied' },
        { status: 404 }
      );
    }

    // Verify store access (RBAC store scope)
    if (saleForAccessCheck.storeId) {
      try {
        await requireStoreAccess(request, saleForAccessCheck.storeId);
      } catch {
        return NextResponse.json(
          { error: 'Not authorized to access this store' },
          { status: 403 }
        );
      }
    }

    // Replay is permitted only after organization, permission and store scope checks.
    const existingReturn = await prisma.return.findFirst({
      where: {
        organizationId,
        idempotencyKey: validatedIdempotencyKey.data,
      },
      include: {
        items: {
          include: {
            saleItem: { include: { variant: { include: { product: true } } } },
          },
        },
      },
    });

    if (existingReturn) {
      if (existingReturn.idempotencyRequestHash !== requestHash) {
        return NextResponse.json(
          { error: 'Idempotency-Key already used with different return data' },
          { status: 409 }
        );
      }
      return NextResponse.json(existingReturn, { status: 200 });
    }

    // Create the return and persist its idempotency key in the same transaction.
    const result = await returnService.create(
      organizationId,
      authenticatedUserId,
      returnData,
      { key: validatedIdempotencyKey.data, requestHash }
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message.startsWith('Permission required')) {
      return NextResponse.json(
        { error: 'Permission required' },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.message === 'Not authorized to access this store') {
      return NextResponse.json(
        { error: 'Not authorized to access this store' },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.message === 'Idempotency-Key already used with different return data') {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message === 'Sale not found or access denied') {
      return NextResponse.json(
        { error: 'Sale not found or access denied' },
        { status: 404 }
      );
    }

    if (error instanceof Error && (
      error.message === 'Sale cannot be returned from status' ||
      error.message.startsWith('Cannot return') ||
      error.message.startsWith('Inventory not found')
    )) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    console.error('Error creating return:', error);
    return NextResponse.json(
      { error: 'Failed to create return' },
      { status: 500 }
    );
  }
}
