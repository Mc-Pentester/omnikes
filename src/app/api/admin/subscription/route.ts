import { NextResponse } from 'next/server';

/**
 * Subscription administration moved out of tenant RBAC.
 * Use /api/platform/subscriptions instead.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Subscription management is platform-only. Use /api/platform/subscriptions.' },
    { status: 410 },
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: 'Subscription management is platform-only. Use /api/platform/subscriptions/{organizationId}.' },
    { status: 410 },
  );
}
