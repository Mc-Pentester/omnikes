import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getAuthenticatedUser, requireCurrentOrganizationId, requirePermission, requirePlatformRole } from '@omnikes/lib/auth';
import { PLATFORM_OPERATOR_ROLE } from '@omnikes/repositories/platform-role.repository';
import { localBackupService } from '@omnikes/services/local-backup.service';

export const runtime = 'nodejs';

const DEFAULT_MAX_RESTORE_BYTES = 256 * 1024 * 1024;
const MAX_RESTORE_BYTES_CAP = 1024 * 1024 * 1024;
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

function maxRestoreBytes(): number {
  const configured = Number(process.env.OMNIKES_MAX_RESTORE_BYTES);
  if (!process.env.OMNIKES_MAX_RESTORE_BYTES) return DEFAULT_MAX_RESTORE_BYTES;
  if (!Number.isSafeInteger(configured) || configured <= 0) return DEFAULT_MAX_RESTORE_BYTES;
  return Math.min(configured, MAX_RESTORE_BYTES_CAP);
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Authentication')) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (message.startsWith('Permission required') || message.startsWith('Role required') || message.startsWith('Platform role required')) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
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

    // Stream the generated dump instead of loading the entire backup into Node.js memory.
    const body = Readable.toWeb(createReadStream(result.filePath)) as ReadableStream<Uint8Array>;
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${result.fileName}"`,
        'Content-Length': String(result.size),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  let tempPath: string | null = null;
  let organizationId: string | null = null;
  let actorId: string | null = null;
  try {
    organizationId = await requireCurrentOrganizationId(request);
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    actorId = user.id;
    await requirePermission(request, 'backup.restore');
    // Restoring a dump replaces the entire connected database, across tenant boundaries.
    // A tenant ADMIN role is insufficient; require the dedicated platform-scoped operator role.
    await requirePlatformRole(request, PLATFORM_OPERATOR_ROLE);

    const maxBytes = maxRestoreBytes();
    const contentLength = Number(request.headers.get('content-length'));
    // Reject oversized requests before formData() can buffer their multipart body.
    if (Number.isFinite(contentLength) && contentLength > maxBytes + MULTIPART_OVERHEAD_BYTES) {
      return NextResponse.json({ error: 'Backup file exceeds the configured size limit' }, { status: 413 });
    }

    const form = await request.formData();
    const entry = form.get('backup');
    if (!(entry instanceof File)) {
      return NextResponse.json({ error: 'A backup file is required' }, { status: 400 });
    }
    if (entry.size <= 0) {
      return NextResponse.json({ error: 'Backup file size is invalid' }, { status: 400 });
    }
    if (entry.size > maxBytes) {
      return NextResponse.json({ error: 'Backup file exceeds the configured size limit' }, { status: 413 });
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
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('Permission required') || message.startsWith('Role required') || message.startsWith('Platform role required')) {
      console.warn(JSON.stringify({
        event: 'security.authorization_denied',
        action: 'backup.restore',
        actorId,
        organizationId,
        reason: message.startsWith('Platform role required') ? 'platform_role_required' : 'permission_required',
        timestamp: new Date().toISOString(),
      }));
    }
    return errorResponse(error);
  } finally {
    if (tempPath) await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}
