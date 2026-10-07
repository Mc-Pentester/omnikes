import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentOrganizationId, requirePermission } from '@omnikes/lib/auth';
import { purchaseService } from '@omnikes/services/purchase.service';

type RouteContext = { params: Promise<{ id: string }> };

function authErrorResponse(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (error.message.startsWith('Permission required')) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
  return null;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'purchase.manage');
    const { id } = await context.params;
    return NextResponse.json(await purchaseService.cancel(id, organizationId));
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to cancel purchase' }, { status: 400 });
  }
}
