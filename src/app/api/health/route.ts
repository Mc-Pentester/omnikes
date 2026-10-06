import { NextResponse } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: 'ok',
        timestamp,
        version: process.env.npm_package_version ?? 'unknown',
        services: {
          database: {
            status: 'connected',
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(
      'Health check failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    return NextResponse.json(
      {
        status: 'degraded',
        timestamp,
        version: process.env.npm_package_version ?? 'unknown',
        services: {
          database: {
            status: 'disconnected',
          },
        },
      },
      { status: 503 }
    );
  }
}
