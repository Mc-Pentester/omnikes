import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@omnikes/lib/prisma';
import { getAuthenticatedUser, requirePermission } from '@omnikes/lib/auth';
import { creditPinSetupSchema } from '@omnikes/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    await requirePermission(request, 'credit.approve');
    const record = await prisma.user.findFirst({
      where: { id: user.id, organizationId: user.organizationId },
      select: { creditPinHash: true },
    });
    return NextResponse.json({ configured: Boolean(record?.creditPinHash) });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Permission required')) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    return NextResponse.json({ error: 'Unable to read credit PIN status' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    await requirePermission(request, 'credit.approve');

    const input = creditPinSetupSchema.parse(await request.json());
    const account = await prisma.user.findFirst({
      where: { id: user.id, organizationId: user.organizationId, isActive: true },
      select: { password: true },
    });
    if (!account || !(await bcrypt.compare(input.currentPassword, account.password))) {
      return NextResponse.json({ error: 'Current password is invalid' }, { status: 403 });
    }

    const creditPinHash = await bcrypt.hash(input.pin, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { creditPinHash, creditPinFailedAttempts: 0, creditPinLockedUntil: null },
    });
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        action: 'CREDIT_PIN_CONFIGURED',
        module: 'credit',
        entityId: user.id,
        entityType: 'User',
        metadata: { credential: 'PIN', configured: true },
      },
    });
    return NextResponse.json({ success: true, configured: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'PIN must contain 4 to 8 digits and current password is required' }, { status: 400 });
    if (error instanceof Error && error.message.startsWith('Permission required')) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    console.error('Error configuring credit PIN:', error);
    return NextResponse.json({ error: 'Failed to configure credit PIN' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    await requirePermission(request, 'credit.approve');
    const body = z.object({ currentPassword: z.string().min(1) }).strict().parse(await request.json());
    const account = await prisma.user.findFirst({
      where: { id: user.id, organizationId: user.organizationId, isActive: true },
      select: { password: true },
    });
    if (!account || !(await bcrypt.compare(body.currentPassword, account.password))) {
      return NextResponse.json({ error: 'Current password is invalid' }, { status: 403 });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { creditPinHash: null, creditPinFailedAttempts: 0, creditPinLockedUntil: null },
    });
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        action: 'CREDIT_PIN_REMOVED',
        module: 'credit',
        entityId: user.id,
        entityType: 'User',
        metadata: { credential: 'PIN', configured: false },
      },
    });
    return NextResponse.json({ success: true, configured: false });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
    if (error instanceof Error && error.message.startsWith('Permission required')) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    return NextResponse.json({ error: 'Failed to remove credit PIN' }, { status: 500 });
  }
}
