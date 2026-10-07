import { promises as fs } from 'node:fs';
import { prisma } from '@omnikes/lib/prisma';
import { localBackupService } from '@omnikes/services/local-backup.service';

describe('local backup and restore PostgreSQL proof', () => {
  const createdOrganizationName = `Backup Proof ${Date.now()}`;
  let backupPath: string | null = null;

  it('creates a custom dump and restores the database to the dump point', async () => {
    const marker = await prisma.organization.create({
      data: {
        name: createdOrganizationName,
        slug: `backup-proof-${Date.now()}`,
        country: 'HT',
        currency: 'HTG',
        locale: 'fr-HT',
        timezone: 'America/Port-au-Prince',
        cloudEnabled: false,
        onlineStoreEnabled: false,
      },
    });

    const backup = await localBackupService.createBackup();
    backupPath = backup.filePath;

    await prisma.organization.create({
      data: {
        name: 'Backup Proof Must Disappear',
        slug: `backup-disappear-${Date.now()}`,
        country: 'HT',
        currency: 'HTG',
        locale: 'fr-HT',
        timezone: 'America/Port-au-Prince',
        cloudEnabled: false,
        onlineStoreEnabled: false,
      },
    });

    const restored = await localBackupService.restoreBackup(backup.filePath);

    expect(restored.restored).toBe(true);
    expect(await prisma.organization.findUnique({ where: { id: marker.id } })).not.toBeNull();
    expect(await prisma.organization.findFirst({ where: { name: 'Backup Proof Must Disappear' } })).toBeNull();

    await fs.rm(backup.filePath, { force: true });
    await fs.rm(restored.safetyBackup.filePath, { force: true });
    backupPath = null;
  });

  afterEach(async () => {
    if (backupPath) await fs.rm(backupPath, { force: true }).catch(() => undefined);
    await prisma.organization.deleteMany({ where: { name: { in: [createdOrganizationName, 'Backup Proof Must Disappear'] } } });
  });
});
