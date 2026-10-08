import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@omnikes/lib/prisma';
import { requireAuthenticatedUser, requireCurrentOrganizationId, requirePermission } from '@omnikes/lib/auth';
import { supplierPaymentService } from '@omnikes/services/supplier-payment.service';
import { idempotencyKeySchema, supplierPaymentCreateSchema } from '@omnikes/lib/validation';

function authErrorResponse(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (error.message.startsWith('Permission required')) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
  return null;
}

function paymentDataMatches(
  cached: Record<string, unknown>,
  input: Record<string, unknown>,
) {
  return (
    cached.storeId === input.storeId &&
    cached.supplierId === input.supplierId &&
    (cached.purchaseId ?? null) === (input.purchaseId ?? null) &&
    Number(cached.amount) === Number(input.amount) &&
    cached.method === input.method &&
    (cached.reference ?? null) === (input.reference ?? null) &&
    (cached.note ?? null) === (input.note ?? null) &&
    (cached.cashSessionId ?? null) === (input.cashSessionId ?? null)
  );
}

export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'supplier.payment.read');
    const { searchParams } = new URL(request.url);
    return NextResponse.json(await supplierPaymentService.list(organizationId, {
      supplierId: searchParams.get('supplierId') || undefined,
      purchaseId: searchParams.get('purchaseId') || undefined,
      storeId: searchParams.get('storeId') || undefined,
      skip: searchParams.get('skip') ?? undefined,
      take: searchParams.get('take') ?? undefined,
    }));
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid payment parameters' }, { status: 400 });
    const auth = authErrorResponse(error); if (auth) return auth;
    return NextResponse.json({ error: 'Failed to list supplier payments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let organizationId: string | undefined;
  let userId: string | undefined;
  let idempotencyKey: string | undefined;
  let paymentData: Record<string, unknown> | undefined;

  try {
    const user = await requireAuthenticatedUser(request);
    userId = user.id;
    organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'supplier.payment.manage');

    const rawKey = request.headers.get('Idempotency-Key');
    if (!rawKey) {
      return NextResponse.json({ error: 'Idempotency-Key header is required' }, { status: 400 });
    }

    const validatedKey = idempotencyKeySchema.safeParse(rawKey);
    if (!validatedKey.success) {
      return NextResponse.json({ error: 'Invalid Idempotency-Key' }, { status: 400 });
    }
    idempotencyKey = validatedKey.data;

    const parsed = supplierPaymentCreateSchema.parse(await request.json());
    paymentData = parsed as unknown as Record<string, unknown>;

    const existing = await prisma.supplierPaymentIdempotency.findUnique({
      where: {
        organizationId_key: {
          organizationId,
          key: idempotencyKey,
        },
      },
    });

    if (existing) {
      if (existing.userId !== userId) {
        return NextResponse.json({ error: 'Idempotency-Key already used by a different user' }, { status: 409 });
      }
      if (
        existing.storeId !== parsed.storeId ||
        existing.supplierId !== parsed.supplierId ||
        (existing.purchaseId ?? null) !== (parsed.purchaseId ?? null)
      ) {
        return NextResponse.json({ error: 'Idempotency-Key already used for different payment context' }, { status: 409 });
      }

      if (existing.status === 'COMPLETED') {
        const cached = JSON.parse(existing.responseBody || '{}') as {
          payment?: Record<string, unknown>;
          input?: Record<string, unknown>;
        };
        if (!cached.payment || !cached.input || !paymentDataMatches(cached.input, paymentData)) {
          return NextResponse.json({ error: 'Idempotency-Key already used with different payment data' }, { status: 409 });
        }
        return NextResponse.json(cached.payment, { status: existing.responseStatus || 201 });
      }

      return NextResponse.json({ error: 'Supplier payment operation already in progress' }, { status: 409 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const record = await tx.supplierPaymentIdempotency.create({
        data: {
          organizationId,
          userId,
          supplierId: parsed.supplierId,
          purchaseId: parsed.purchaseId,
          storeId: parsed.storeId,
          key: idempotencyKey,
          status: 'PROCESSING',
        },
      });

      const payment = await supplierPaymentService.create(organizationId, userId, parsed);

      await tx.supplierPaymentIdempotency.update({
        where: { id: record.id },
        data: {
          status: 'COMPLETED',
          responseStatus: 201,
          responseBody: JSON.stringify({
            payment,
            input: paymentData,
          }),
        },
      });

      return payment;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002' &&
      organizationId &&
      userId &&
      idempotencyKey &&
      paymentData
    ) {
      const committed = await prisma.supplierPaymentIdempotency.findUnique({
        where: {
          organizationId_key: {
            organizationId,
            key: idempotencyKey,
          },
        },
      });

      if (committed && committed.userId === userId && committed.status === 'COMPLETED') {
        const cached = JSON.parse(committed.responseBody || '{}') as {
          payment?: Record<string, unknown>;
          input?: Record<string, unknown>;
        };
        if (cached.payment && cached.input && paymentDataMatches(cached.input, paymentData)) {
          return NextResponse.json(cached.payment, { status: committed.responseStatus || 201 });
        }
      }
    }

    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid payment data' }, { status: 400 });
    const auth = authErrorResponse(error); if (auth) return auth;
    if (error instanceof Error && /(not found|exceeds|requires|only valid|cancelled|access denied|outstanding)/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error creating supplier payment:', error);
    return NextResponse.json({ error: 'Failed to create supplier payment' }, { status: 500 });
  }
}
