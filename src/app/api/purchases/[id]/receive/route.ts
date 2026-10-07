import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { purchaseService } from '@omnikes/services/purchase.service';
import { requireCurrentOrganizationId, requirePermission } from '@omnikes/lib/auth';
type RouteContext = { params: Promise<{ id: string }> };
import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentOrganizationId, requirePermission } from '@omnikes/lib/auth';

export function authErrorResponse(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (error.message.startsWith('Permission required')) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
  return null;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'purchase.receive');
    const { id } = await context.params;
    return NextResponse.json(await purchaseService.receive(id, organizationId, await request.json()));
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid receipt data' }, { status: 400 });
    const auth = authErrorResponse(error); if (auth) return auth;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to receive purchase' }, { status: 400 });
  }
}