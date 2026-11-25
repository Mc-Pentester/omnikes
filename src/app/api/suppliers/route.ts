import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentOrganizationId, requirePermission } from '@omnikes/lib/auth';
import { supplierRepository } from '@omnikes/repositories/supplier.repository';
import { supplierCreateSchema, supplierListQuerySchema } from '@omnikes/lib/validation';

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

export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'supplier.read');

    const { searchParams } = new URL(request.url);
    const query = supplierListQuerySchema.parse({
      search: searchParams.get('search') || undefined,
      includeInactive: searchParams.get('includeInactive') ?? undefined,
      skip: searchParams.get('skip') ?? undefined,
      take: searchParams.get('take') ?? undefined,
    });

    return NextResponse.json(
      await supplierRepository.listByOrganization(organizationId, query),
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid supplier parameters' }, { status: 400 });
    }
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('Error listing suppliers:', error);
    return NextResponse.json({ error: 'Failed to list suppliers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'supplier.manage');

    const validatedData = supplierCreateSchema.parse(await request.json());

    const supplier = await supplierRepository.create({
      ...validatedData,
      organization: { connect: { id: organizationId } },
    });

    return NextResponse.json(supplier, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid supplier data' }, { status: 400 });
    }
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: 'Supplier code already exists in this organization' }, { status: 409 });
    }
    console.error('Error creating supplier:', error);
    return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 });
  }
}
