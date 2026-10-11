import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PUT } from '../../app/api/backup/route';

vi.mock('../../lib/auth', () => ({
  getAuthenticatedUser: vi.fn(),
  requireCurrentOrganizationId: vi.fn(),
  requirePermission: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock('../../services/local-backup.service', () => ({
  localBackupService: {
    createBackup: vi.fn(),
    restoreBackup: vi.fn(),
    recordAudit: vi.fn(),
  },
}));

import { getAuthenticatedUser, requireCurrentOrganizationId, requirePermission, requireRole } from '../../lib/auth';
import { localBackupService } from '../../services/local-backup.service';

const mockedGetAuthenticatedUser = getAuthenticatedUser as ReturnType<typeof vi.fn>;
const mockedRequireCurrentOrganizationId = requireCurrentOrganizationId as ReturnType<typeof vi.fn>;
const mockedRequirePermission = requirePermission as ReturnType<typeof vi.fn>;
const mockedRequireRole = requireRole as ReturnType<typeof vi.fn>;
const mockedRestoreBackup = localBackupService.restoreBackup as ReturnType<typeof vi.fn>;

describe('Database restore authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequireCurrentOrganizationId.mockResolvedValue('org-a');
    mockedGetAuthenticatedUser.mockResolvedValue({ id: 'user-a', organizationId: 'org-a' });
    mockedRequirePermission.mockResolvedValue(undefined);
    mockedRequireRole.mockResolvedValue(undefined);
  });

  it('rejects a user without backup.restore permission before checking the role or restoring', async () => {
    mockedRequirePermission.mockRejectedValue(new Error('Permission required: backup.restore'));
    const request = new NextRequest('http://localhost/api/backup', { method: 'PUT' });

    const response = await PUT(request);

    expect(response.status).toBe(403);
    expect(mockedRequireRole).not.toHaveBeenCalled();
    expect(mockedRestoreBackup).not.toHaveBeenCalled();
  });

  it('rejects a user without the ADMIN role even when backup.restore permission is present', async () => {
    mockedRequireRole.mockRejectedValue(new Error('Role required: ADMIN'));
    const request = new NextRequest('http://localhost/api/backup', { method: 'PUT' });

    const response = await PUT(request);

    expect(response.status).toBe(403);
    expect(mockedRequirePermission).toHaveBeenCalledWith(expect.anything(), 'backup.restore');
    expect(mockedRequireRole).toHaveBeenCalledWith(expect.anything(), 'ADMIN');
    expect(mockedRestoreBackup).not.toHaveBeenCalled();
  });
});
