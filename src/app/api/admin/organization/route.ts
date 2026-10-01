import { NextRequest, NextResponse } from 'next/server';
import {
  requireCurrentOrganizationId,
  requireAuthenticatedUser,
  requirePermission,
} from '@omnikes/lib/auth';
import { adminOrganizationUpdateSchema } from '@omnikes/lib/validation';
import { adminOrganizationService } from '@omnikes/services/admin-organization.service';

function authError(error: unknown) {
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
    await requirePermission(request, 'organization.read');
    const actor = await requireAuthenticatedUser(request);
    const organization = await adminOrganizationService.get(organizationId, actor.id);
    return NextResponse.json({ organization });
  } catch (error) {
    const auth = authError(error);
    if (auth) return auth;
    if (error instanceof Error && error.message === 'Organization not found') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Admin organization GET error:', error);
    return NextResponse.json({ error: 'Failed to get organization' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'organization.update');
    const actor = await requireAuthenticatedUser(request);
    const body = adminOrganizationUpdateSchema.parse(await request.json());
    const organization = await adminOrganizationService.update(
      organizationId,
      actor.id,
      body,
    );
    return NextResponse.json({ organization });
  } catch (error) {
    const auth = authError(error);
    if (auth) return auth;
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.message },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === 'Invalid timezone') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'Organization not found') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Admin organization PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 });
  }
}
