import { NextRequest, NextResponse } from 'next/server';
import {
  requireCurrentOrganizationId,
  requirePermission,
} from '@omnikes/lib/auth';
import { issueHardwareBridgeToken } from '@omnikes/lib/hardware/bridge-token';

const MIN_TOKEN_LENGTH = 32;

function errorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : '';
  if (message === 'Authentication required' || message === 'Invalid or expired session') return 401;
  if (message.startsWith('Permission required:')) return 403;
  if (message.includes('OMNIKES_HARDWARE_BRIDGE_TOKEN')) return 503;
  return 500;
}

export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'hardware.bridge.read');

    const secret = process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN?.trim() ?? '';
    if (secret.length < MIN_TOKEN_LENGTH) {
      return NextResponse.json(
        { error: 'Hardware bridge authentication is not configured' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const token = issueHardwareBridgeToken(organizationId);

    return NextResponse.json(
      { token, expiresIn: 300 },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const status = errorStatus(error);
    const message =
      status === 401
        ? (error instanceof Error ? error.message : 'Authentication required')
        : status === 403
          ? 'Permission required'
          : status === 503
            ? 'Hardware bridge authentication is not configured'
            : 'Hardware bridge token issuance failed';

    return NextResponse.json(
      { error: message },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
