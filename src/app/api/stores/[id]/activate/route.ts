import { NextRequest, NextResponse } from 'next/server';
import { storeService } from '@omnikes/services/store.service';
import { requireCurrentOrganizationId, requirePermission } from '@omnikes/lib/auth';

/**
 * POST /api/stores/[id]/activate
 * Activate a store for the authenticated user's organization
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'store.activate');
    const { id: storeId } = await params;

    const store = await storeService.activate(storeId, organizationId);

    return NextResponse.json({ store });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      if (error.message.startsWith('Permission required')) {
        return NextResponse.json(
          { error: 'Permission required' },
          { status: 403 }
        );
      }

      if (error.message === 'Store not found or access denied') {
        return NextResponse.json(
          { error: 'Store not found or access denied' },
          { status: 404 }
        );
      }
    }
    
    console.error('Error activating store:', error);
    return NextResponse.json(
      { error: 'Failed to activate store' },
      { status: 500 }
    );
  }
}
