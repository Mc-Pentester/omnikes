import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getAuthenticatedUser, requireCurrentOrganizationId, requirePermission, requirePlatformRole } from '@omnikes/lib/auth';
import { PLATFORM_OPERATOR_ROLE } from '@omnikes/repositories/platform-role.repository';
import { localBackupService } from '@omnikes/services/local-backup.service';

export const runtime = 'nodejs';

const DEFAULT_MAX_RESTORE_BYTES = 256 * 1024 * 1024;
const MAX_RESTORE_BYTES_CAP = 1024 * 1024 * 1024;

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
  if (message.includes('Backup file exceeds the configured size limit')) return NextResponse.json({ error: message }, { status: 413 });
  if (message.includes('Invalid backup') || message.includes('Backup file size is invalid') || message.includes('A backup file is required') || message.includes('Unsupported content type') || message.includes('DATABASE_URL is required')) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  console.error('[backup] Operation failed', error);
  return NextResponse.json({ error: 'Backup operation failed. Check local application logs for details.' }, { status: 500 });
}

function safeSourceFileName(request: NextRequest): string {
  const supplied = request.headers.get('x-backup-filename') ?? 'uploaded-backup.dump';
  const leaf = path.basename(supplied).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
  return leaf || 'uploaded-backup.dump';
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
  let restoreStarted = false;
  let operationId: string | null = null;
  let sourceFileName = 'uploaded-backup.dump';
  let receivedBytes = 0;

  try {
    organizationId = await requireCurrentOrganizationId(request);
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    actorId = user.id;
    await requirePermission(request, 'backup.restore');
    // Restore replaces the entire connected database, so a tenant ADMIN role is insufficient.
    await requirePlatformRole(request, PLATFORM_OPERATOR_ROLE);

    const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (contentType !== 'application/octet-stream') {
      return NextResponse.json({ error: 'Unsupported content type; send the backup as application/octet-stream' }, { status: 415 });
    }
    if (!request.body) return NextResponse.json({ error: 'A backup file is required' }, { status: 400 });

    const maxBytes = maxRestoreBytes();
    const contentLengthHeader = request.headers.get('content-length');
    if (contentLengthHeader !== null) {
      const contentLength = Number(contentLengthHeader);
      if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
        return NextResponse.json({ error: 'Invalid Content-Length header' }, { status: 400 });
      }
      if (contentLength > maxBytes) return NextResponse.json({ error: 'Backup file exceeds the configured size limit' }, { status: 413 });
    }

    sourceFileName = safeSourceFileName(request);
    const tempDir = path.join(process.cwd(), '.omnikes', 'tmp');
    await fs.mkdir(tempDir, { recursive: true });
    tempPath = path.join(tempDir, `restore-${randomUUID()}.dump`);

    const byteLimit = new Transform({
      transform(chunk: Buffer | string, _encoding, callback) {
        const size = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
        receivedBytes += size;
        if (receivedBytes > maxBytes) {
          callback(new Error('Backup file exceeds the configured size limit'));
          return;
        }
        callback(null, chunk);
      },
    });

    await pipeline(
      Readable.fromWeb(request.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>),
      byteLimit,
      createWriteStream(tempPath, { flags: 'wx', mode: 0o600 }),
    );
    if (receivedBytes <= 0) return NextResponse.json({ error: 'Backup file size is invalid' }, { status: 400 });

    operationId = randomUUID();
    const auditContext = {
      operationId,
      actorId,
      organizationId,
      sourceFileName,
      sourceSize: receivedBytes,
    };
    // Write-ahead event must be durable before any database replacement begins.
    // The journal lives beside local backups, not inside the database being restored.
    await localBackupService.recordRestoreJournal({ ...auditContext, event: 'RESTORE_STARTED' });
    restoreStarted = true;

    const result = await localBackupService.restoreBackup(tempPath);

    let localAuditRecorded = false;
    try {
      await localBackupService.recordRestoreJournal({
        ...auditContext,
        event: 'RESTORE_SUCCEEDED',
        safetyBackupFileName: result.safetyBackup.fileName,
      });
      localAuditRecorded = true;
    } catch (journalError) {
      // Restore already completed; do not report it as failed just because the
      // post-restore journal write failed. The preceding STARTED event remains evidence.
      console.error('[backup] Restore completed but success journal could not be persisted', {
        operationId,
        error: journalError,
      });
    }

    try {
      await localBackupService.recordAudit(user.id, organizationId, 'BACKUP_RESTORED', {
        operationId,
        sourceFileName,
        sourceSize: receivedBytes,
        safetyBackupFileName: result.safetyBackup.fileName,
        localAuditRecorded,
      });
    } catch (databaseAuditError) {
      // The restored dump may have replaced users, organizations, or audit rows.
      // PostgreSQL audit is supplemental; the local journal is the durable record.
      console.warn('[backup] PostgreSQL audit row could not be written after restore', {
        operationId,
        error: databaseAuditError,
      });
    }

    return NextResponse.json({
      restored: true,
      operationId,
      safetyBackup: result.safetyBackup.fileName,
      auditRecorded: localAuditRecorded,
      ...(localAuditRecorded ? {} : { auditWarning: 'Restore completed, but its final audit event could not be saved to the local journal.' }),
    });
  } catch (error) {
    if (restoreStarted && operationId && actorId && organizationId) {
      try {
        await localBackupService.recordRestoreJournal({
          event: 'RESTORE_FAILED',
          operationId,
          actorId,
          organizationId,
          sourceFileName,
          sourceSize: receivedBytes,
          failureCode: 'restore_failed',
        });
      } catch (journalError) {
        console.error('[backup] Failed to persist restore failure event', { operationId, error: journalError });
      }
    }

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
