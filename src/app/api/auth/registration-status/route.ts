import { NextResponse } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';

/** Public status used only to show or hide the initial setup form. */
export async function GET() {
  try {
    const existingOrganization = await prisma.organization.findFirst({ select: { id: true } });
    return NextResponse.json(
      { available: !existingOrganization },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch {
    // Fail closed: if the database cannot be checked, do not expose signup.
    return NextResponse.json(
      { available: false },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}
