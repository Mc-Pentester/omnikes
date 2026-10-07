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
  // pg_dump does not accept schema parameter in connection string
  url.searchParams.delete('schema');
  return {
    connection: url.toString(),
    password,
  };
}

function toolEnvironment(password: string) {
  return password ? { ...process.env, PGPASSWORD: password } : { ...process.env };
}

export async function resolvePostgresTool(toolName: 'pg_dump' | 'pg_restore', envVar: string): Promise<string> {
  // 1. Check explicit environment variable override
  if (process.env[envVar]) {
    const envPath = process.env[envVar]!;
    try {
      await fs.access(envPath);
      return envPath;
    } catch {
      throw new Error(
        `PostgreSQL tool specified in ${envVar} not found: ${envPath}. Please verify the path is correct.`,
      );
    }
  }

  // 2. Check if tool is available in PATH
  if (process.platform !== 'win32') {
    // On Unix-like systems, try the command directly
    return toolName;
  }

  // 3. Windows-specific detection
  const windowsPaths = [
    'C:\\Program Files\\PostgreSQL',
    'C:\\Program Files (x86)\\PostgreSQL',
  ];

  interface Candidate {
    toolPath: string;
    version: string;
  }

  const candidates: Candidate[] = [];

  for (const basePath of windowsPaths) {
    try {
      const entries = await fs.readdir(basePath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const versionPath = path.join(basePath, entry.name, 'bin');
          const toolPath = path.join(versionPath, `${toolName}.exe`);
          candidates.push({ toolPath, version: entry.name });
        }
      }
    } catch {
      // Directory doesn't exist or is not accessible, skip
    }
  }

  // Sort by version (newest first) - PostgreSQL versions are numeric
  candidates.sort((a, b) => {
    const aNum = parseFloat(a.version);
    const bNum = parseFloat(b.version);
    return bNum - aNum; // Descending
  });

  // Try candidates from newest to oldest
  for (const candidate of candidates) {
    try {
      await fs.access(candidate.toolPath);
      return candidate.toolPath;
    } catch {
      // File doesn't exist, try next
    }
  }

  // 4. Not found - provide explicit error
  const availableVersions = candidates
    .map((c) => `  - PostgreSQL ${c.version}: ${c.toolPath}`)
    .join('\n');

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

  const pgDumpPath = await resolvePostgresTool('pg_dump', 'PG_DUMP_PATH');

  await runTool(
    pgDumpPath,
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
      const pgRestorePath = await resolvePostgresTool('pg_restore', 'PG_RESTORE_PATH');

      await runTool(
        pgRestorePath,
        ['--list', sourcePath],
        toolEnvironment(password),
      );

      const safetyBackup = await runBackup('pre-restore');

      try {
        await runTool(
          pgRestorePath,
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
        metadata: metadata as import('@prisma/client').Prisma.InputJsonValue,
      },
    });
  }
}

export const localBackupService = new LocalBackupService();
