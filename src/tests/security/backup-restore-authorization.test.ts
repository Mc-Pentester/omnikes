import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PUT } from '../../app/api/backup/route';

vi.mock('../../lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
  requireCurrentOrganizationId: vi.fn(),
  requirePermission: vi.fn(),
  requirePlatformRole: vi.fn(),
}));

vi.mock('../../services/local-backup.service', () => ({
  localBackupService: {
    createBackup: vi.fn(),
    restoreBackup: vi.fn(),
    recordAudit: vi.fn(),
    recordRestoreJournal: vi.fn(),
  },
}));

import { getAuthenticatedUser, requireCurrentOrganizationId, requirePermission, requirePlatformRole } from '../../lib/auth';
import { localBackupService } from '../../services/local-backup.service';

const mockedGetAuthenticatedUser = getAuthenticatedUser as ReturnType<typeof vi.fn>;
const mockedRequireCurrentOrganizationId = requireCurrentOrganizationId as ReturnType<typeof vi.fn>;
const mockedRequirePermission = requirePermission as ReturnType<typeof vi.fn>;
const mockedRequirePlatformRole = requirePlatformRole as ReturnType<typeof vi.fn>;
const mockedRestoreBackup = localBackupService.restoreBackup as ReturnType<typeof vi.fn>;
const mockedRecordAudit = localBackupService.recordAudit as ReturnType<typeof vi.fn>;
const mockedRecordRestoreJournal = localBackupService.recordRestoreJournal as ReturnType<typeof vi.fn>;

function restoreRequest() {
  return new NextRequest('http://localhost/api/backup', {
    method: 'PUT',
    headers: {
      'content-type': 'application/octet-stream',
      'x-backup-filename': 'nightly-backup.dump',
    },
    body: Buffer.from('valid-backup-payload'),
  });
}

describe('Database restore authorization and upload limits', () => {
  afterEach(() => {
    delete process.env.OMNIKES_MAX_RESTORE_BYTES;
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequireCurrentOrganizationId.mockResolvedValue('org-a');
    mockedGetAuthenticatedUser.mockResolvedValue({ id: 'user-a', organizationId: 'org-a' });
    mockedRequirePermission.mockResolvedValue(undefined);
    mockedRequirePlatformRole.mockResolvedValue(undefined);
    mockedRestoreBackup.mockResolvedValue({ restored: true, safetyBackup: { fileName: 'pre-restore.dump' } });
    mockedRecordAudit.mockResolvedValue(undefined);
    mockedRecordRestoreJournal.mockResolvedValue(undefined);
  });

  it('rejects a user without backup.restore permission before checking the role or restoring', async () => {
    mockedRequirePermission.mockRejectedValue(new Error('Permission required: backup.restore'));
    const response = await PUT(new NextRequest('http://localhost/api/backup', { method: 'PUT' }));

    expect(response.status).toBe(403);
    expect(mockedRequirePlatformRole).not.toHaveBeenCalled();
    expect(mockedRestoreBackup).not.toHaveBeenCalled();
  });

  it('logs a structured security event when the platform operator role is missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockedRequirePlatformRole.mockRejectedValue(new Error('Platform role required: OMNIKES_PLATFORM_OPERATOR'));
    const response = await PUT(new NextRequest('http://localhost/api/backup', { method: 'PUT' }));

    expect(response.status).toBe(403);
    expect(mockedRequirePermission).toHaveBeenCalledWith(expect.anything(), 'backup.restore');
    expect(mockedRequirePlatformRole).toHaveBeenCalledWith(expect.anything(), 'OMNIKES_PLATFORM_OPERATOR');
    expect(mockedRestoreBackup).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledOnce();
    const event = JSON.parse(String(warnSpy.mock.calls[0][0]));
    expect(event).toMatchObject({
      event: 'security.authorization_denied',
      action: 'backup.restore',
      actorId: 'user-a',
      organizationId: 'org-a',
      reason: 'platform_role_required',
    });
  });

  it('rejects multipart uploads instead of buffering them through formData()', async () => {
    const request = new NextRequest('http://localhost/api/backup', {
      method: 'PUT',
      headers: { 'content-type': 'multipart/form-data; boundary=test' },
      body: '--test--',
    });
    const response = await PUT(request);

    expect(response.status).toBe(415);
    expect(mockedRestoreBackup).not.toHaveBeenCalled();
  });

  it('rejects an oversized declared upload before writing it to disk', async () => {
    process.env.OMNIKES_MAX_RESTORE_BYTES = '1';
    const request = new NextRequest('http://localhost/api/backup', {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      body: Buffer.from('xx'),
    });
    const response = await PUT(request);

    expect(response.status).toBe(413);
    expect(mockedRestoreBackup).not.toHaveBeenCalled();
  });

  it('journals restore completion outside PostgreSQL and succeeds if the restored DB rejects its audit row', async () => {
    mockedRecordAudit.mockRejectedValue(new Error('foreign key no longer exists'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const response = await PUT(restoreRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      restored: true,
      safetyBackup: 'pre-restore.dump',
      auditRecorded: true,
    });
    expect(mockedRecordRestoreJournal).toHaveBeenCalledTimes(2);
    expect(mockedRecordRestoreJournal.mock.calls[0][0]).toMatchObject({
      event: 'RESTORE_STARTED',
      actorId: 'user-a',
      organizationId: 'org-a',
      sourceFileName: 'nightly-backup.dump',
      sourceSize: Buffer.byteLength('valid-backup-payload'),
    });
    expect(mockedRecordRestoreJournal.mock.calls[1][0]).toMatchObject({
      event: 'RESTORE_SUCCEEDED',
      safetyBackupFileName: 'pre-restore.dump',
    });
    expect(mockedRecordAudit).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('records a failed restore attempt in the independent journal', async () => {
    mockedRestoreBackup.mockRejectedValue(new Error('pg_restore internal details'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await PUT(restoreRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Backup operation failed. Check local application logs for details.');
    expect(JSON.stringify(body)).not.toContain('pg_restore internal details');
    expect(mockedRecordRestoreJournal).toHaveBeenCalledTimes(2);
    expect(mockedRecordRestoreJournal.mock.calls[0][0].event).toBe('RESTORE_STARTED');
    expect(mockedRecordRestoreJournal.mock.calls[1][0]).toMatchObject({
      event: 'RESTORE_FAILED',
      failureCode: 'restore_failed',
    });
    expect(errorSpy).toHaveBeenCalled();
  });
});
