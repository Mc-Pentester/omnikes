import { NextResponse } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';

export async function GET() {
  const healthCheck = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    environment: process.env.NODE_ENV || 'unknown',
  };

  let databaseStatus = 'unknown';
  let databaseError: string | null = null;

  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    databaseStatus = 'connected';
  } catch (error) {
    databaseStatus = 'disconnected';
    databaseError = error instanceof Error ? error.message : 'Unknown error';
    healthCheck.status = 'degraded';
  }

  return NextResponse.json({
    ...healthCheck,
    services: {
      database: {
        status: databaseStatus,
        error: databaseError,
      },
      // Future services can be added here:
      // redis: { status: 'not_configured' },
      // sync: { status: 'not_configured' },
      // realtime: { status: 'not_configured' },
    },
  });
}
