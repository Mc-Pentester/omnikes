import { NextRequest, NextResponse } from 'next/server';
import { proformaService } from '@omnikes/services/proforma.service';
import { requireCurrentOrganizationId } from '@omnikes/lib/auth';

/**
 * POST /api/proformas/[id]/validate
 * Validate a proforma (DRAFT -> SENT)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = await requireCurrentOrganizationId(request);

    const proforma = await proformaService.validate(id, organizationId);

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

    if (error instanceof Error && error.message === 'Only DRAFT proformas can be validated') {
      return NextResponse.json(
        { error: 'Only DRAFT proformas can be validated' },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message === 'Proforma must have at least one item to be validated') {
      return NextResponse.json(
        { error: 'Proforma must have at least one item to be validated' },
        { status: 400 }
      );
    }
    
    console.error('Error validating proforma:', error);
    return NextResponse.json(
      { error: 'Failed to validate proforma' },
      { status: 500 }
    );
  }
}
