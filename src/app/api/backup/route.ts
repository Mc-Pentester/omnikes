import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getAuthenticatedUser, requireCurrentOrganizationId, requirePermission } from '@omnikes/lib/auth';
import { localBackupService } from '@omnikes/services/local-backup.service';

export const runtime = 'nodejs';

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Authentication')) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (message.startsWith('Permission required')) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
  if (message.includes('already in progress')) return NextResponse.json({ error: message }, { status: 409 });
  if (message.includes('Invalid backup') || message.includes('DATABASE_URL is required')) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    await requirePermission(request, 'backup.create');

    const result = await localBackupService.createBackup();
    await localBackupService.recordAudit(user.id, organizationId, 'BACKUP_CREATED', {
      fileName: result.fileName,
      size: result.size,
    });

    const data = await fs.readFile(result.filePath);
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${result.fileName}"`,
        'Content-Length': String(data.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  let tempPath: string | null = null;
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    await requirePermission(request, 'backup.restore');

    const form = await request.formData();
    const entry = form.get('backup');
    if (!(entry instanceof File)) {
      return NextResponse.json({ error: 'A backup file is required' }, { status: 400 });
    }
    if (entry.size <= 0 || entry.size > 1024 * 1024 * 1024) {
      return NextResponse.json({ error: 'Backup file size is invalid' }, { status: 400 });
    }

    const tempDir = path.join(process.cwd(), '.omnikes', 'tmp');
    await fs.mkdir(tempDir, { recursive: true });
    tempPath = path.join(tempDir, `restore-${randomUUID()}.dump`);
    await fs.writeFile(tempPath, Buffer.from(await entry.arrayBuffer()));

    const result = await localBackupService.restoreBackup(tempPath);
    await localBackupService.recordAudit(user.id, organizationId, 'BACKUP_RESTORED', {
      sourceFileName: entry.name,
      sourceSize: entry.size,
      safetyBackupFileName: result.safetyBackup.fileName,
    });

    return NextResponse.json({
      restored: true,
      safetyBackup: result.safetyBackup.fileName,
    });
  } catch (error) {
    return errorResponse(error);
  } finally {
    if (tempPath) await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}
