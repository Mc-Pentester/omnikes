import { NextRequest, NextResponse } from 'next/server';
import { proformaService } from '@omnikes/services/proforma.service';
import { requireCurrentOrganizationId, requireStoreAccess, requirePermission } from '@omnikes/lib/auth';

/**
 * POST /api/proformas/[id]/accept
 * Accept a proforma (SENT -> ACCEPTED)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'proforma.accept');

    // Get proforma first to check store access
    const existingProforma = await proformaService.getById(id, organizationId);
    if (existingProforma.storeId) {
      await requireStoreAccess(request, existingProforma.storeId);
    }

    const proforma = await proformaService.accept(id, organizationId);

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

    if (error instanceof Error && error.message.includes('Cannot accept proforma with status')) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    console.error('Error accepting proforma:', error);
    return NextResponse.json(
      { error: 'Failed to accept proforma' },
      { status: 500 }
    );
  }
}
