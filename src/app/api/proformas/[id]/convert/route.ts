import { NextRequest, NextResponse } from 'next/server';
import { proformaService } from '@omnikes/services/proforma.service';
import { requireCurrentOrganizationId, requireStoreAccess, requirePermission } from '@omnikes/lib/auth';

/**
 * POST /api/proformas/[id]/convert
 * Convert a proforma to a sale (ACCEPTED -> CONVERTED)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = await requireCurrentOrganizationId(request);

    // Check permission
    await requirePermission(request, 'proforma.convert');

    // Get proforma first to check store access
    const existingProforma = await proformaService.getById(id, organizationId);
    if (existingProforma.storeId) {
      await requireStoreAccess(request, existingProforma.storeId);
    }

    const sale = await proformaService.convert(id, organizationId);

    return NextResponse.json(sale);
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

    if (error instanceof Error && error.message.includes('Cannot convert proforma with status')) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message === 'Proforma has already been converted to a sale') {
      return NextResponse.json(
        { error: 'Proforma has already been converted to a sale' },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message === 'Cannot convert an empty proforma') {
      return NextResponse.json(
        { error: 'Cannot convert an empty proforma' },
        { status: 400 }
      );
    }

    console.error('Error converting proforma:', error);
    return NextResponse.json(
      { error: 'Failed to convert proforma' },
      { status: 500 }
    );
  }
}
