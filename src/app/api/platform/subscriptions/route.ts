import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@omnikes/lib/auth';
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

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const organizations = await platformSubscriptionService.list(actor.id);
    return NextResponse.json({ organizations });
  } catch (error) {
    const auth = authError(error);
    if (auth) return auth;
    console.error('Platform subscriptions GET error:', error);
    return NextResponse.json({ error: 'Failed to list subscriptions' }, { status: 500 });
  }
}
