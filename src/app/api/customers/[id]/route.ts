import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentOrganizationId, requirePermission } from '@omnikes/lib/auth';
import { customerRepository } from '@omnikes/repositories/customer.repository';
import { customerUpdateSchema } from '@omnikes/lib/validation';

const customerIdSchema = z.string().cuid();

function authErrorResponse(error: unknown) {
  if (!(error instanceof Error)) return null;

  if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (error.message.startsWith('Permission required')) {
    return NextResponse.json({ error: 'Permission required' }, { status: 403 });
  }

  return null;
}

/**
 * GET /api/customers/[id]
 * Get an active customer within the current organization.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    customerIdSchema.parse(id);

    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'customer.read');

    const customer = await customerRepository.findById(id, organizationId);

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found or access denied' },
        { status: 404 }
      );
    }

    return NextResponse.json(customer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 });
    }

    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    console.error('Error getting customer:', error);
    return NextResponse.json(
      { error: 'Failed to get customer' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/customers/[id]
 * Update a customer within the current organization.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    customerIdSchema.parse(id);

    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'customer.update');

    const body = await request.json();
    const validatedData = customerUpdateSchema.parse(body);

    if (Object.keys(validatedData).length === 0) {
      return NextResponse.json(
        { error: 'At least one customer field is required' },
        { status: 400 }
      );
    }

    const customer = await customerRepository.update(
      id,
      organizationId,
      validatedData
    );

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found or access denied' },
        { status: 404 }
      );
    }

    return NextResponse.json(customer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid customer data' }, { status: 400 });
    }

    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    console.error('Error updating customer:', error);
    return NextResponse.json(
      { error: 'Failed to update customer' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/customers/[id]
 * Soft-delete (deactivate) a customer within the current organization.
 * Historical sales/proformas remain intact.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    customerIdSchema.parse(id);

    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'customer.delete');

    const customer = await customerRepository.delete(id, organizationId);

    if (!customer) {
      return NextResponse.json(
        { error: 'Customer not found or already inactive' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      customerId: customer.id,
      isActive: customer.isActive,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 });
    }

    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    console.error('Error deactivating customer:', error);
    return NextResponse.json(
      { error: 'Failed to deactivate customer' },
      { status: 500 }
    );
  }
}
