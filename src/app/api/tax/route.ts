import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentOrganizationId } from '@omnikes/lib/auth';
import { prisma } from '@omnikes/lib/prisma';

/**
 * GET /api/tax
 * Get tax configuration for the authenticated user's organization
 */
export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        taxConfiguration: true,
      },
    });

    if (!organization) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    if (!organization.taxConfiguration) {
      // Return null tax rate if no configuration exists
      // Backend will use fallback 0.18 in SaleService.recalculateTotals()
      return NextResponse.json({
        taxRate: null,
        country: null,
      });
    }

    return NextResponse.json({
      taxRate: Number(organization.taxConfiguration.taxRate),
      country: organization.taxConfiguration.country,
    });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    console.error('Error getting tax configuration:', error);
    return NextResponse.json(
      { error: 'Failed to get tax configuration' },
      { status: 500 }
    );
  }
}
