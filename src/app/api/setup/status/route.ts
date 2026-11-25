import { NextResponse } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';

/**
 * Public bootstrap check used only to decide whether the local installation
 * needs its first organization and administrator configured.
 * No organization data is exposed.
 */
export async function GET() {
  try {
    const organizationCount = await prisma.organization.count();

    return NextResponse.json({
      configured: organizationCount > 0,
    });
  } catch (error) {
    console.error('Setup status error:', error);
    return NextResponse.json(
      { error: 'Unable to determine installation status' },
      { status: 500 }
    );
  }
}
