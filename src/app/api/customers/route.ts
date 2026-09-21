import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentOrganizationId, requirePermission } from '@omnikes/lib/auth';
import { customerRepository } from '@omnikes/repositories/customer.repository';

/**
 * GET /api/customers
 * List customers for an organization
 */
export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'customer.read');

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const skip = searchParams.get('skip') ? parseInt(searchParams.get('skip')!) : undefined;
    const take = searchParams.get('take') ? parseInt(searchParams.get('take')!) : undefined;

    const result = await customerRepository.listByOrganization(organizationId, {
      search,
      skip,
      take,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      if (error.message.startsWith('Permission required')) {
        return NextResponse.json(
          { error: 'Permission required' },
          { status: 403 }
        );
      }
    }

    console.error('Error listing customers:', error);
    return NextResponse.json(
      { error: 'Failed to list customers' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/customers
 * Create a new customer
 */
export async function POST(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'customer.create');

    const body = await request.json();

    const customer = await customerRepository.create({
      ...body,
      organization: {
        connect: { id: organizationId },
      },
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      if (error.message.startsWith('Permission required')) {
        return NextResponse.json(
          { error: 'Permission required' },
          { status: 403 }
        );
      }

      if (error.message.includes('validation')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    console.error('Error creating customer:', error);
    return NextResponse.json(
      { error: 'Failed to create customer' },
      { status: 500 }
    );
  }
}
