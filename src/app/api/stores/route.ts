import { NextRequest, NextResponse } from 'next/server';
import { storeService } from '@omnikes/services/store.service';
import { storeRepository } from '@omnikes/repositories/store.repository';
import { requireCurrentOrganizationId, requirePermission } from '@omnikes/lib/auth';
import { validatePagination } from '@omnikes/lib/pagination';
import { storeSchema } from '@omnikes/lib/validation';

/**
 * GET /api/stores
 * List stores for the authenticated user's organization
 */
export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    const { searchParams } = new URL(request.url);
    
    const isActive = searchParams.get('isActive') === 'true' ? true : 
                     searchParams.get('isActive') === 'false' ? false : undefined;
    
    const { skip, take } = validatePagination(
      searchParams.get('skip'),
      searchParams.get('take')
    );

    const result = await storeService.listStores(organizationId, {
      isActive,
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

      if (error.message.includes('Invalid skip') || error.message.includes('Invalid take')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }
    
    console.error('Error listing stores:', error);
    return NextResponse.json(
      { error: 'Failed to list stores' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/stores
 * Create a new store for the authenticated user's organization
 */
export async function POST(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'store.create');
    const body = await request.json();

    // Validate input using Zod schema
    const validatedData = storeSchema.parse({
      ...body,
      organizationId, // Force organizationId from session, ignore body
    });

    // Check for duplicate code within the same organization
    const existingStore = await storeRepository.findByCode(validatedData.code, organizationId);
    if (existingStore) {
      return NextResponse.json(
        { error: 'Un magasin avec ce code existe déjà dans cette organisation.' },
        { status: 409 }
      );
    }

    // Create store
    const store = await storeService.create(organizationId, {
      organizationId,
      name: validatedData.name,
      code: validatedData.code,
      address: validatedData.address,
      city: validatedData.city,
      country: validatedData.country,
      phone: validatedData.phone,
      email: validatedData.email,
      isActive: validatedData.isActive,
    });

    return NextResponse.json(
      { store },
      { status: 201 }
    );
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

      // Zod validation errors
      if (error.name === 'ZodError') {
        return NextResponse.json(
          { error: 'Invalid input data', details: error.message },
          { status: 400 }
        );
      }

      // Prisma P2002 - Unique constraint violation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any).code === 'P2002') {
        return NextResponse.json(
          { error: 'Un magasin avec ce code existe déjà dans cette organisation.' },
          { status: 409 }
        );
      }
    }
    
    console.error('Error creating store:', error);
    return NextResponse.json(
      { error: 'Failed to create store' },
      { status: 500 }
    );
  }
}
