import { NextRequest, NextResponse } from 'next/server';
import { storeService } from '@omnikes/services/store.service';
import { requireCurrentOrganizationId } from '@omnikes/lib/auth';

/**
 * GET /api/stores
 * List stores for the authenticated user's organization
 */
export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    const { searchParams } = new URL(request.url);
    
    const isActive = searchParams.get('isActive') === 'true' ? true : 
                     searchParams.get('isActive') === 'false' ? false : undefined;
    const skip = parseInt(searchParams.get('skip') || '0');
    const take = parseInt(searchParams.get('take') || '50');

    const result = await storeService.listStores(organizationId, {
      isActive,
      skip,
      take,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    console.error('Error listing stores:', error);
    return NextResponse.json(
      { error: 'Failed to list stores' },
      { status: 500 }
    );
  }
}
