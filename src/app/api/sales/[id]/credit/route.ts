import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { ZodError } from 'zod';
import { saleService } from '@omnikes/services/sale.service';
import { requireCurrentOrganizationId, requirePermission, requireStoreAccess, getAuthenticatedUser, requireSubscriptionCapability } from '@omnikes/lib/auth';
import { prisma } from '@omnikes/lib/prisma';
import { saleCreditSchema } from '@omnikes/lib/validation';
import { roleRepository } from '@omnikes/repositories/role.repository';

/**
 * POST /api/sales/[id]/credit
 * Authorize explicit customer credit for a PENDING sale.
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
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    await requirePermission(request, 'credit.request');

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizationId },
      select: { organizationId: true, storeId: true },
    });

    if (!sale || sale.organizationId !== organizationId) {
      return NextResponse.json({ error: 'Sale not found or access denied' }, { status: 404 });
    }

    await requireStoreAccess(request, sale.storeId);
    await requireSubscriptionCapability(request, 'customers.credit', 'WRITE');

    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid credit approval request' }, { status: 400 });
    }
    const data = saleCreditSchema.parse(body);
    const approverEmail = typeof body.approverEmail === 'string' ? body.approverEmail.trim().toLowerCase() : '';
    const approverPassword = typeof body.approverPassword === 'string' ? body.approverPassword : '';
    const approverPin = typeof body.approverPin === 'string' ? body.approverPin : '';

    if (!approverEmail || (!approverPassword && !approverPin) || (approverPassword && approverPin)) {
      return NextResponse.json({ error: 'Manager credentials are required to approve customer credit' }, { status: 400 });
    }

    // Re-authenticate a second, distinct user at the point of approval.
    // The cashier's session or legacy sale.credit permission can never approve itself.
    const approver = await prisma.user.findFirst({
      where: { email: approverEmail, organizationId, isActive: true },
      select: { id: true },
    });

    if (!approver || approver.id === user.id) {
      return NextResponse.json({ error: 'Invalid manager approval credentials' }, { status: 403 });
    }

    // Both password and PIN challenges share the same persistent lockout.
    // The row lock makes concurrent guesses count atomically.
    const credentialResult = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>\`
        SELECT id FROM users WHERE id = \${approver.id} AND "organizationId" = \${organizationId} FOR UPDATE
      \`;
      const current = await tx.user.findFirst({
        where: { id: approver.id, organizationId, isActive: true },
        select: {
          password: true,
          creditPinHash: true,
          creditApprovalFailedAttempts: true,
          creditApprovalLockedUntil: true,
        },
      });
      if (!current) return { valid: false, locked: false };
      if (current.creditApprovalLockedUntil && current.creditApprovalLockedUntil > new Date()) {
        return { valid: false, locked: true };
      }

      const valid = approverPin
        ? Boolean(current.creditPinHash) && /^\d{4,8}$/.test(approverPin)
          && await bcrypt.compare(approverPin, current.creditPinHash!)
        : await bcrypt.compare(approverPassword, current.password);

      if (valid) {
        await tx.user.update({
          where: { id: approver.id },
          data: { creditApprovalFailedAttempts: 0, creditApprovalLockedUntil: null },
        });
        return { valid: true, locked: false };
      }

      const attempts = current.creditApprovalFailedAttempts + 1;
      await tx.user.update({
        where: { id: approver.id },
        data: {
          creditApprovalFailedAttempts: attempts >= 5 ? 0 : attempts,
          creditApprovalLockedUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
        },
      });
      return { valid: false, locked: attempts >= 5 };
    });

    if (credentialResult.locked) {
      return NextResponse.json({ error: 'Manager approval is temporarily locked after repeated failures' }, { status: 423 });
    }
    if (!credentialResult.valid) {
      return NextResponse.json({ error: 'Invalid manager approval credentials' }, { status: 403 });
    }

    if (!(await roleRepository.hasPermission(approver.id, 'credit.approve'))) {
      return NextResponse.json({ error: 'Approver is not authorized to approve customer credit' }, { status: 403 });
    }

    if (!(await roleRepository.canAccessStore(approver.id, sale.storeId))) {
      return NextResponse.json({ error: 'Approver is not authorized for this store' }, { status: 403 });
    }

    const credit = await saleService.authorizeCredit(
      saleId,
      organizationId,
      approver.id,
      data,
      sale.storeId
    );

    return NextResponse.json(credit, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Subscription entitlement required:')) return NextResponse.json({ error: error.message }, { status: 402 });
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (error instanceof Error && error.message.startsWith('Permission required')) {
      return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    }

    if (error instanceof Error && error.message === 'Not authorized to access this store') {
      return NextResponse.json({ error: 'Not authorized to access this store' }, { status: 403 });
    }

    if (error instanceof Error && error.message === 'Sale not found or access denied') {
      return NextResponse.json({ error: 'Sale not found or access denied' }, { status: 404 });
    }

    if (error instanceof Error && (
      error.message === 'Credit can only be authorized for a PENDING sale' ||
      error.message === 'A customer is required to authorize credit' ||
      error.message === 'Credit is already authorized for this sale' ||
      error.message === 'Customer not found or access denied' ||
      error.message === 'Credit customer must match the sale customer' ||
      error.message.startsWith('Credit amount exceeds remaining balance') ||
      error.message.startsWith('Customer credit limit exceeded') ||
      error.message === 'Credit due date must be in the future' ||
      error.message === 'Sale store changed during credit approval; please retry'
    )) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error('Error authorizing sale credit:', error);
    return NextResponse.json({ error: 'Failed to authorize sale credit' }, { status: 500 });
  }
}
