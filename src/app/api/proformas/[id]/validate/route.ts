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
 * POST /api/proformas/[id]/validate
 * Validate a proforma (DRAFT -> SENT)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = getOrganizationId(request);

    const proforma = await proformaService.validate(id, organizationId);

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
