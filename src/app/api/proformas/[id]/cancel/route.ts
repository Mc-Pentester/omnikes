import { NextRequest, NextResponse } from 'next/server';
import { proformaService } from '@omnikes/services/proforma.service';

function getOrganizationId(request: NextRequest): string {
  const orgId = request.headers.get('x-organization-id');
  if (!orgId) {
    throw new Error('Organization ID header is required');
  }
  return orgId;
}

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
    const organizationId = getOrganizationId(request);

    const proforma = await proformaService.cancel(id, organizationId);

    return NextResponse.json(proforma);
  } catch (error) {
    if (error instanceof Error && error.message === 'Organization ID header is required') {
      return NextResponse.json(
        { error: 'Organization ID header is required' },
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
