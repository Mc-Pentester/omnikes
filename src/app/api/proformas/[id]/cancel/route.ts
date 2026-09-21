import { NextRequest, NextResponse } from 'next/server';
import { proformaService } from '@omnikes/services/proforma.service';
import { requireCurrentOrganizationId, requireStoreAccess, requirePermission } from '@omnikes/lib/auth';

/**
 * POST /api/proformas/[id]/cancel
 * Cancel a proforma
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'proforma.cancel');

    // Get proforma first to check store access
    const existingProforma = await proformaService.getById(id, organizationId);
    if (existingProforma.storeId) {
      await requireStoreAccess(request, existingProforma.storeId);
    }

    const proforma = await proformaService.cancel(id, organizationId);

    return NextResponse.json(proforma);
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === 'Proforma not found or access denied') {
      return NextResponse.json(
        { error: 'Proforma not found or access denied' },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message === 'Not authorized to access this store') {
      return NextResponse.json(
        { error: 'Not authorized to access this store' },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.message.startsWith('Permission required')) {
      return NextResponse.json(
        { error: 'Permission required' },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.message === 'Proforma is already cancelled') {
      return NextResponse.json(
        { error: 'Proforma is already cancelled' },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message === 'Cannot cancel a converted proforma') {
      return NextResponse.json(
        { error: 'Cannot cancel a converted proforma' },
        { status: 409 }
      );
    }
    
    console.error('Error cancelling proforma:', error);
    return NextResponse.json(
      { error: 'Failed to cancel proforma' },
      { status: 500 }
    );
  }
}
