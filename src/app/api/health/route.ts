import { NextResponse } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';

export async function GET() {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (error) {
    // Log the error internally without exposing details
    console.error('Health check failed:', error instanceof Error ? error.message : 'Unknown error');
    
    return NextResponse.json({ status: 'unhealthy' }, { status: 503 });
  }
}
