import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireCurrentOrganizationId } from '@omnikes/lib/auth';
import { adminAuditService } from '@omnikes/services/admin-audit.service';

function mapError(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (error.message.startsWith('Permission required')) {
    return NextResponse.json({ error: 'Permission required' }, { status: 403 });
  }
  if (error.message.startsWith('Invalid ')) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    const actor = await requireAuthenticatedUser(request);
    const params = request.nextUrl.searchParams;
    const result = await adminAuditService.list(organizationId, actor.id, {
      search: params.get('search') || undefined,
      action: params.get('action') || undefined,
      module: params.get('module') || undefined,
      storeId: params.get('storeId') || undefined,
      from: params.get('from') || undefined,
      to: params.get('to') || undefined,
      page: Number(params.get('page') || '1'),
      take: Number(params.get('take') || '50'),
    });
    return NextResponse.json(result);
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) return mapped;
    console.error('Admin audit GET error:', error);
    return NextResponse.json({ error: 'Failed to list audit logs' }, { status: 500 });
  }
}
