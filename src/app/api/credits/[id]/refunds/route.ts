import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuthenticatedUser, requirePermission, requireStoreAccess, requireSubscriptionCapability } from '@omnikes/lib/auth';
import { creditRefundSchema, idempotencyKeySchema } from '@omnikes/lib/validation';
import { prisma } from '@omnikes/lib/prisma';
import { creditRefundService } from '@omnikes/services/credit-refund.service';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    await requirePermission(request, 'payment.refund');
    await requireSubscriptionCapability(request, 'customers.credit', 'WRITE');

    const { id } = await params;
    const idempotencyKey = idempotencyKeySchema.parse(request.headers.get('Idempotency-Key'));
    const data = creditRefundSchema.parse(await request.json());
    const credit = await prisma.saleCredit.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { storeId: true },
    });
    if (!credit) return NextResponse.json({ error: 'Credit not found' }, { status: 404 });
    await requireStoreAccess(request, credit.storeId);

    const result = await creditRefundService.process(user.organizationId, user.id, id, data, idempotencyKey);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: 'Invalid credit refund data', details: error.issues }, { status: 400 });
    const message = error instanceof Error ? error.message : '';
    if (message === 'Authentication required') return NextResponse.json({ error: message }, { status: 401 });
    if (message.startsWith('Permission required') || message === 'Not authorized to access this store') return NextResponse.json({ error: message }, { status: 403 });
    if (message === 'Credit not found' || message === 'Return not found or access denied' || message === 'Credit payment not found or access denied') return NextResponse.json({ error: message }, { status: 404 });
    if (message.includes('exceeds remaining refundable amount') || message.includes('open cash session') || message.includes('Outstanding customer credit')) return NextResponse.json({ error: message }, { status: 409 });
    if (message.includes('Idempotency key already used') || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')) return NextResponse.json({ error: message || 'Idempotency key conflict' }, { status: 409 });
    if (message === 'Return does not belong to this customer credit' || message === 'Credit payment does not belong to this customer credit') return NextResponse.json({ error: message }, { status: 409 });
    console.error('Error processing customer credit refund:', error);
    return NextResponse.json({ error: 'Failed to process customer credit refund' }, { status: 500 });
  }
}
