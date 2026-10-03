import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@omnikes/lib/auth';

const MIN_TOKEN_LENGTH = 32;

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedUser(request);

    const token = process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN?.trim() ?? '';
    if (token.length < MIN_TOKEN_LENGTH) {
      return NextResponse.json(
        { error: 'Hardware bridge authentication is not configured' },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { token },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication required';
    const status = message.includes('Authentication') || message.includes('session') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
