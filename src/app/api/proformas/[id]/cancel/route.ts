import { NextRequest, NextResponse } from 'next/server';
import { proformaService } from '@omnikes/services/proforma.service';
import { requireCurrentOrganizationId } from '@omnikes/lib/auth';

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
