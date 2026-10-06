import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@omnikes/lib/auth';
import { adminSubscriptionUpdateSchema } from '@omnikes/lib/validation';
import { platformSubscriptionService } from '@omnikes/services/platform-subscription.service';

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const { organizationId } = await params;
    const organization = await platformSubscriptionService.get(organizationId, actor.id);
    return NextResponse.json({ organization });
  } catch (error) {
    const auth = authError(error);
    if (auth) return auth;
    if (error instanceof Error && error.message === 'Organization not found') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Platform subscription GET error:', error);
    return NextResponse.json({ error: 'Failed to get subscription' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const { organizationId } = await params;
    const body = adminSubscriptionUpdateSchema.parse(await request.json());
    const organization = await platformSubscriptionService.update(
      organizationId,
      actor.id,
      body,
    );
    return NextResponse.json({ organization });
  } catch (error) {
    const auth = authError(error);
    if (auth) return auth;
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid subscription data', details: error.message }, { status: 400 });
    }
    if (error instanceof Error && (error.message === 'Invalid expiration date' || error.message === 'Expiration date must be in the future')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'Organization not found') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Platform subscription PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 });
  }
}
