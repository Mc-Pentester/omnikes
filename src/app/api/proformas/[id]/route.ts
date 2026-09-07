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
 * GET /api/proformas/[id]
 * Get a single proforma
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = getOrganizationId(request);
    const proforma = await proformaService.getById(id, organizationId);

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
    
    console.error('Error getting proforma:', error);
    return NextResponse.json(
      { error: 'Failed to get proforma' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/proformas/[id]
 * Update a proforma
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = getOrganizationId(request);
    const body = await request.json();

    const proforma = await proformaService.update(id, organizationId, body);

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

    if (error instanceof Error && error.message === 'Only DRAFT proformas can be modified') {
      return NextResponse.json(
        { error: 'Only DRAFT proformas can be modified' },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    console.error('Error updating proforma:', error);
    return NextResponse.json(
      { error: 'Failed to update proforma' },
      { status: 500 }
    );
  }
}
