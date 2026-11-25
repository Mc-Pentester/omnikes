import { NextResponse } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';

/** Indicates whether registration is the initial setup or a request to join. */
export async function GET() {
  try {
    const existingOrganization = await prisma.organization.findFirst({ select: { id: true } });
    return NextResponse.json(
      { mode: existingOrganization ? 'join' : 'initial' },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch {
    return NextResponse.json(
      { error: 'Impossible de vérifier la disponibilité de l’inscription.' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}
