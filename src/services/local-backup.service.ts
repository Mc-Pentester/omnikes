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
  url.searchParams.delete('schema');
  return { connection: url.toString(), password };
}

function toolEnvironment(password: string) {
  return password ? { ...process.env, PGPASSWORD: password } : { ...process.env };
}

export async function resolvePostgresTool(toolName: 'pg_dump' | 'pg_restore', envVar: string): Promise<string> {
  if (process.env[envVar]) {
    const envPath = process.env[envVar]!;
    try {
      await fs.access(envPath);
      return envPath;
    } catch {
      throw new Error(`PostgreSQL tool specified in ${envVar} not found: ${envPath}. Please verify the path is correct.`);
    }
  }

  if (process.platform !== 'win32') return toolName;

  const windowsPaths = ['C:\\Program Files\\PostgreSQL', 'C:\\Program Files (x86)\\PostgreSQL'];
  const candidates: Array<{ toolPath: string; version: string }> = [];
  for (const basePath of windowsPaths) {
    try {
      const entries = await fs.readdir(basePath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const toolPath = path.join(basePath, entry.name, 'bin', `${toolName}.exe`);
          candidates.push({ toolPath, version: entry.name });
        }
      }
    } catch {
      // Missing or inaccessible PostgreSQL installation directory.
    }
  }

  candidates.sort((a, b) => parseFloat(b.version) - parseFloat(a.version));
  for (const candidate of candidates) {
    try {
      await fs.access(candidate.toolPath);
      return candidate.toolPath;
    } catch {
      // Try the next detected installation.
    }
  }

  const availableVersions = candidates.map((c) => `  - PostgreSQL ${c.version}: ${c.toolPath}`).join('\n');
  throw new Error(
    `PostgreSQL tool '${toolName}' not found.\n` +
    `Solutions:\n` +
    `  1. Set ${envVar} environment variable to the full path (e.g., C:\\Program Files\\PostgreSQL\\18\\bin\\${toolName}.exe)\n` +
    `  2. Add PostgreSQL bin directory to your system PATH\n` +
    `  3. Ensure PostgreSQL is installed in a standard location\n` +
    (availableVersions ? `\nDetected PostgreSQL installations (binary may be missing):\n${availableVersions}` : ''),
  );
}

function runTool(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<ToolResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, shell: false, windowsHide: true });
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
  const pgDumpPath = await resolvePostgresTool('pg_dump', 'PG_DUMP_PATH');
  await runTool(pgDumpPath, ['--format=custom', '--no-owner', '--no-acl', '--file', filePath, connection], toolEnvironment(password));

  const stat = await fs.stat(filePath);
  if (stat.size <= 0 || stat.size > MAX_BACKUP_BYTES) {
    await fs.rm(filePath, { force: true });
    throw new Error('Generated backup has an invalid size');
  }
  return { fileName, filePath, size: stat.size, createdAt: new Date().toISOString() };
}

export interface RestoreAuditEntry {
  event: 'RESTORE_STARTED' | 'RESTORE_SUCCEEDED' | 'RESTORE_FAILED';
  operationId: string;
  timestamp?: string;
  actorId: string;
  organizationId: string;
  sourceFileName: string;
  sourceSize: number;
  safetyBackupFileName?: string;
  failureCode?: string;
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
    return this.exclusive(async () => runBackup());
  }

  /**
   * Append to a local journal that is independent of PostgreSQL. A database restore
   * can delete or replace audit rows in that same database, so this journal is the
   * durable record of the restore lifecycle.
   */
  async recordRestoreJournal(entry: RestoreAuditEntry) {
    await ensureDirectory();
    const journalPath = path.join(backupDir(), 'restore-audit.jsonl');
    const handle = await fs.open(journalPath, 'a', 0o600);
    try {
      await handle.chmod(0o600);
      await handle.writeFile(`${JSON.stringify({ ...entry, timestamp: entry.timestamp ?? new Date().toISOString() })}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async restoreBackup(sourcePath: string) {
    return this.exclusive(async () => {
      const stat = await fs.stat(sourcePath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_BACKUP_BYTES) throw new Error('Invalid backup file');

      const { connection, password } = databaseConnection();
      const pgRestorePath = await resolvePostgresTool('pg_restore', 'PG_RESTORE_PATH');
      await runTool(pgRestorePath, ['--list', sourcePath], toolEnvironment(password));
      const safetyBackup = await runBackup('pre-restore');

      try {
        await runTool(pgRestorePath, [
          '--exit-on-error', '--single-transaction', '--clean', '--if-exists',
          '--no-owner', '--no-acl', '--dbname', connection, sourcePath,
        ], toolEnvironment(password));
      } catch (error) {
        throw new Error(`Restore failed. Safety backup preserved at ${safetyBackup.fileName}. ${error instanceof Error ? error.message : String(error)}`);
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
        metadata: metadata as import('@prisma/client').Prisma.InputJsonValue,
      },
    });
  }
}

export const localBackupService = new LocalBackupService();
