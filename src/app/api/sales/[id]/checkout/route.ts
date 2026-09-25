import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { requireCurrentOrganizationId, requirePermission, getAuthenticatedUser } from '@omnikes/lib/auth';
import { paymentSchema } from '@omnikes/lib/validation';

/**
 * POST /api/sales/[id]/checkout
 * Atomic checkout with idempotency
 * - Validates sale state
 * - Creates payment
 * - Deducts stock
 * - Completes sale
 * All in a single transaction
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: saleId } = await params;
    const organizationId = await requireCurrentOrganizationId(request);
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    await requirePermission(request, 'payment.create');
    await requirePermission(request, 'sale.complete');

    // Get idempotency key
    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (!idempotencyKey) {
      return NextResponse.json(
        { error: 'Idempotency-Key header is required' },
        { status: 400 }
      );
    }

    // Parse payment data
    const body = await request.json();
    const paymentData = paymentSchema.parse(body);

    // Check for existing idempotency record
    const existingIdempotency = await prisma.checkoutIdempotency.findUnique({
      where: {
        organizationId_key: {
          organizationId,
          key: idempotencyKey,
        },
      },
    });

    if (existingIdempotency) {
      // Check if key was used for a different sale
      if (existingIdempotency.saleId !== saleId) {
        return NextResponse.json(
          { error: 'Idempotency-Key already used for a different sale' },
          { status: 409 }
        );
      }

      // Check if key was used by a different user
      if (existingIdempotency.userId !== user.id) {
        return NextResponse.json(
          { error: 'Idempotency-Key already used by a different user' },
          { status: 409 }
        );
      }

      // Return cached result if completed
      if (existingIdempotency.status === 'COMPLETED') {
        return NextResponse.json(
          JSON.parse(existingIdempotency.responseBody || '{}'),
          { status: existingIdempotency.responseStatus || 200 }
        );
      }

      // If failed, allow retry
      if (existingIdempotency.status === 'FAILED') {
        // Delete failed record to allow retry
        await prisma.checkoutIdempotency.delete({
          where: { id: existingIdempotency.id },
        });
      } else {
        // Still processing - return conflict
        return NextResponse.json(
          { error: 'Checkout operation already in progress' },
          { status: 409 }
        );
      }
    }

    // Execute atomic checkout transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create idempotency record with PROCESSING status
      const idempotencyRecord = await tx.checkoutIdempotency.create({
        data: {
          organizationId,
          userId: user.id,
          saleId,
          key: idempotencyKey,
          status: 'PROCESSING',
        },
      });

      // Reload sale with items and payments
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: {
          items: {
            include: {
              variant: true,
            },
          },
          payments: true,
          store: true,
        },
      });

      if (!sale) {
        throw new Error('Sale not found');
      }

      // Verify organization
      if (sale.organizationId !== organizationId) {
        throw new Error('Sale not found or access denied');
      }

      // Verify store access
      if (sale.storeId) {
        const storeAccess = await tx.store.findUnique({
          where: { id: sale.storeId },
          include: { organization: true },
        });
        if (!storeAccess || storeAccess.organizationId !== organizationId) {
          throw new Error('Not authorized to access this store');
        }
      }

      // Verify sale status
      if (sale.status === 'COMPLETED') {
        throw new Error('Sale is already completed');
      }

      if (sale.status === 'CANCELLED') {
        throw new Error('Sale is cancelled');
      }

      // Verify at least one item
      if (!sale.items || sale.items.length === 0) {
        throw new Error('Sale has no items');
      }

      // Recalculate server total
      const subtotal = sale.items.reduce((sum, item) => sum + Number(item.totalPrice), 0);
      const discount = sale.items.reduce((sum, item) => sum + Number(item.discount), 0);
      const tax = Number(sale.tax);
      const serverTotal = subtotal - discount + tax;

      // Validate payment amount
      if (Number(paymentData.amount) !== serverTotal) {
        throw new Error(`Payment amount mismatch. Expected: ${serverTotal}, Received: ${paymentData.amount}`);
      }

      // Verify and lock inventory for each item
      for (const item of sale.items) {
        const inventory = await tx.$queryRaw<Array<{ id: string; quantity: number; reservedQuantity: number }>>`
          SELECT id, quantity, "reservedQuantity"
          FROM inventories
          WHERE "storeId" = ${sale.storeId} AND "variantId" = ${item.variantId}
          FOR UPDATE
        `;

        if (!inventory || inventory.length === 0) {
          throw new Error(`Inventory not found for variant ${item.variant.sku}`);
        }

        const currentInventory = inventory[0];
        const available = currentInventory.quantity - currentInventory.reservedQuantity;

        if (available < item.quantity) {
          throw new Error(`Insufficient stock for ${item.variant.sku}. Available: ${available}, Required: ${item.quantity}`);
        }

        // Deduct stock
        await tx.inventory.update({
          where: { id: currentInventory.id },
          data: {
            quantity: currentInventory.quantity - item.quantity,
          },
        });

        // Create SALE movement
        await tx.inventoryMovement.create({
          data: {
            inventoryId: currentInventory.id,
            type: 'SALE',
            quantity: -item.quantity,
            referenceId: saleId,
            referenceType: 'SALE',
            notes: `Sale ${sale.orderNumber}`,
          },
        });
      }

      // Create payment
      const payment = await tx.payment.create({
        data: {
          saleId,
          method: paymentData.method,
          amount: paymentData.amount,
          reference: paymentData.reference || `PAY-${Date.now()}`,
          status: 'COMPLETED',
        },
      });

      // Update sale status to COMPLETED
      await tx.sale.update({
        where: { id: saleId },
        data: { status: 'COMPLETED' },
      });

      // Update idempotency record with success
      await tx.checkoutIdempotency.update({
        where: { id: idempotencyRecord.id },
        data: {
          status: 'COMPLETED',
          responseStatus: 201,
          responseBody: JSON.stringify({ payment, sale: { id: sale.id, status: 'COMPLETED' } }),
        },
      });

      // Return completed sale
      return tx.sale.findUnique({
        where: { id: saleId },
        include: {
          store: true,
          customer: true,
          items: {
            include: {
              variant: {
                include: { product: true },
              },
            },
          },
          payments: true,
        },
      });
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    // Handle idempotency failure
    if (error instanceof Error && error.message.includes('Idempotency-Key')) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
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

    if (error instanceof Error && error.message === 'Sale not found or access denied') {
      return NextResponse.json(
        { error: 'Sale not found or access denied' },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message === 'Sale is already completed') {
      return NextResponse.json(
        { error: 'Sale is already completed' },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message.startsWith('Insufficient stock')) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message.startsWith('Payment amount mismatch')) {
      return NextResponse.json(
        { error: error.message },
        { status: 422 }
      );
    }

    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'Checkout failed' },
      { status: 500 }
    );
  }
}
