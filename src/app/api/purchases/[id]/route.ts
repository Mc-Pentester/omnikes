import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentOrganizationId, requirePermission } from '@omnikes/lib/auth';
import { purchaseService } from '@omnikes/services/purchase.service';

type RouteContext = { params: Promise<{ id: string }> };

function authErrorResponse(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (error.message.startsWith('Permission required')) {
    return NextResponse.json({ error: 'Permission required' }, { status: 403 });
  }
  return null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'purchase.read');
    const { id } = await context.params;
    const purchase = await purchaseService.getById(id, organizationId);
    if (!purchase) return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    return NextResponse.json(purchase);
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('Error reading purchase:', error);
    return NextResponse.json({ error: 'Failed to read purchase' }, { status: 500 });
  }
}
