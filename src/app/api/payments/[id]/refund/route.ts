import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { refundService } from '@omnikes/services/refund.service';
import { requireCurrentOrganizationId, requirePermission, getAuthenticatedUser } from '@omnikes/lib/auth';
import { refundSchema } from '@omnikes/lib/validation';
import { prisma } from '@omnikes/lib/prisma';

/**
 * POST /api/payments/[id]/refund
 * Process a refund for a payment
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: paymentId } = await params;
    const organizationId = await requireCurrentOrganizationId(request);
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    await requirePermission(request, 'payment.refund');

    // Verify payment belongs to organization
    const payment = await prisma.payment.findFirst({
      where: { id: paymentId },
      include: {
        sale: {
          select: {
            organizationId: true,
            storeId: true,
          },
        },
      },
    });

    if (!payment || payment.sale.organizationId !== organizationId) {
      return NextResponse.json(
        { error: 'Payment not found or access denied' },
        { status: 404 }
      );
    }

    // Parse refund data
    const body = await request.json();
    const refundData = refundSchema.parse({
      ...body,
      paymentId,
    });

    // Process refund
    const refund = await refundService.process(organizationId, user.id, refundData);

    return NextResponse.json(refund, { status: 201 });
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

    if (error instanceof Error && error.message === 'Payment not found or access denied') {
      return NextResponse.json(
        { error: 'Payment not found or access denied' },
        { status: 404 }
      );
    }

    if (error instanceof Error && (
      error.message === 'An open cash session is required for CASH refunds' ||
      error.message.startsWith('Refund amount exceeds remaining refundable amount')
    )) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    console.error('Error processing refund:', error);
    return NextResponse.json(
      { error: 'Failed to process refund' },
      { status: 500 }
    );
  }
}
