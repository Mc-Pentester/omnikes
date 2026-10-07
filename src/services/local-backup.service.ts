import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { prisma } from '@omnikes/lib/prisma';

const MAX_BACKUP_BYTES = 1024 * 1024 * 1024;
const DEFAULT_BACKUP_DIR = path.join(process.cwd(), '.omnikes', 'backups');

type ToolResult = { stdout: string; stderr: string };

function backupDir() {
  return process.env.OMNIKES_BACKUP_DIR
    ? path.resolve(process.env.OMNIKES_BACKUP_DIR)
    : DEFAULT_BACKUP_DIR;
}

function databaseConnection() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is required');

  const url = new URL(raw);
  const password = url.password;
  url.password = '';
  return {
    connection: url.toString(),
    password,
  };
}

function toolEnvironment(password: string) {
  return password ? { ...process.env, PGPASSWORD: password } : { ...process.env };
}

function runTool(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<ToolResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      shell: false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => reject(new Error(`Unable to start ${command}: ${error.message}`)));
    child.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`${command} failed with exit code ${code}: ${stderr.trim() || stdout.trim()}`));
    });
  });
}

async function ensureDirectory() {
  await fs.mkdir(backupDir(), { recursive: true });
}

function generatedBackupName(prefix = 'omnikes') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}-${randomUUID()}.dump`;
}

async function runBackup(prefix = 'omnikes') {
  await ensureDirectory();
  const fileName = generatedBackupName(prefix);
  const filePath = path.join(backupDir(), fileName);
  const { connection, password } = databaseConnection();

  await runTool(
    process.env.PG_DUMP_PATH || 'pg_dump',
    ['--format=custom', '--no-owner', '--no-acl', '--file', filePath, connection],
    toolEnvironment(password),
  );

  const stat = await fs.stat(filePath);
  if (stat.size <= 0 || stat.size > MAX_BACKUP_BYTES) {
    await fs.rm(filePath, { force: true });
    throw new Error('Generated backup has an invalid size');
  }

  return { fileName, filePath, size: stat.size, createdAt: new Date().toISOString() };
}

export class LocalBackupService {
  private busy = false;

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy) throw new Error('Backup or restore operation already in progress');
    this.busy = true;
    try {
      return await operation();
    } finally {
      this.busy = false;
    }
  }

  async createBackup() {
    return this.exclusive(async () => {
      const result = await runBackup();
      return result;
    });
  }

  async restoreBackup(sourcePath: string) {
    return this.exclusive(async () => {
      const stat = await fs.stat(sourcePath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_BACKUP_BYTES) {
        throw new Error('Invalid backup file');
      }

      const { connection, password } = databaseConnection();
      await runTool(
        process.env.PG_RESTORE_PATH || 'pg_restore',
        ['--list', sourcePath],
        toolEnvironment(password),
      );

      const safetyBackup = await runBackup('pre-restore');

      try {
        await runTool(
          process.env.PG_RESTORE_PATH || 'pg_restore',
          [
            '--exit-on-error',
            '--single-transaction',
            '--clean',
            '--if-exists',
            '--no-owner',
            '--no-acl',
            '--dbname',
            connection,
            sourcePath,
          ],
          toolEnvironment(password),
        );
      } catch (error) {
        throw new Error(
          `Restore failed. Safety backup preserved at ${safetyBackup.fileName}. ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      return { restored: true, safetyBackup };
    });
  }

  async recordAudit(userId: string, organizationId: string, action: string, metadata: Record<string, unknown>) {
    await prisma.auditLog.create({
      data: {
        userId,
        organizationId,
        action,
        module: 'backup',
        entityType: 'DATABASE',
        metadata,
      },
    });
  }
}

export const localBackupService = new LocalBackupService();
