import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentOrganizationId, requirePermission } from '@omnikes/lib/auth';
import { supplierRepository } from '@omnikes/repositories/supplier.repository';
import { supplierUpdateSchema } from '@omnikes/lib/validation';

type RouteContext = { params: Promise<{ id: string }> };

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

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'supplier.read');
    const { id } = await context.params;
    const supplier = await supplierRepository.findById(id, organizationId, true);

    if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    return NextResponse.json(supplier);
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('Error reading supplier:', error);
    return NextResponse.json({ error: 'Failed to read supplier' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'supplier.manage');
    const { id } = await context.params;
    const data = supplierUpdateSchema.parse(await request.json());

    const supplier = await supplierRepository.update(id, organizationId, data);
    if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });

    return NextResponse.json(supplier);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid supplier data' }, { status: 400 });
    }
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: 'Supplier code already exists in this organization' }, { status: 409 });
    }
    console.error('Error updating supplier:', error);
    return NextResponse.json({ error: 'Failed to update supplier' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'supplier.manage');
    const { id } = await context.params;

    const supplier = await supplierRepository.deactivate(id, organizationId);
    if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });

    return NextResponse.json(supplier);
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('Error deactivating supplier:', error);
    return NextResponse.json({ error: 'Failed to deactivate supplier' }, { status: 500 });
  }
}
