import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function required(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function executable(name: string): string {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

function postgresHome(): string {
  return path.resolve(env('OMNIKES_POSTGRES_HOME') || path.join('runtime', 'postgresql'));
}

function bin(name: string): string {
  return path.join(postgresHome(), 'bin', executable(name));
}

function dataDir(): string {
  return path.resolve(env('OMNIKES_POSTGRES_DATA') || path.join('runtime', 'postgresql-data'));
}

function databaseUrl(): string {
  const host = env('OMNIKES_POSTGRES_HOST') || '127.0.0.1';
  const port = env('OMNIKES_POSTGRES_PORT') || '5432';
  const database = env('OMNIKES_POSTGRES_DATABASE') || 'omnikes';
  const user = env('OMNIKES_POSTGRES_USER') || 'omnikes';
  const password = required('OMNIKES_POSTGRES_PASSWORD');
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.setTimeout(1500, () => { socket.destroy(); resolve(false); });
  });
}

function run(file: string, args: string[]): void {
  execFileSync(file, args, { stdio: 'inherit', windowsHide: true });
}

function assertRuntime(): void {
  for (const name of ['initdb', 'pg_ctl', 'postgres']) {
    if (!existsSync(bin(name))) {
      throw new Error(`Embedded PostgreSQL runtime is incomplete: missing ${bin(name)}`);
    }
  }
}

function ensurePasswordFile(password: string): string {
  const file = path.join(dataDir(), '.omnikes-pg-password');
  if (!existsSync(file)) {
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(file, password + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  }
  return file;
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes('--check');
  const home = postgresHome();
  const data = dataDir();

  console.log(`Embedded PostgreSQL home: ${home}`);
  console.log(`Embedded PostgreSQL data: ${data}`);

  assertRuntime();

  if (checkOnly) {
    console.log('Embedded PostgreSQL runtime layout: PASS');
    return;
  }

  const port = Number(env('OMNIKES_POSTGRES_PORT') || '5432');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('OMNIKES_POSTGRES_PORT must be a valid TCP port');
  }

  if (await canConnect(port)) {
    console.log(`PostgreSQL is already listening on 127.0.0.1:${port}; existing instance preserved.`);
    process.env.DATABASE_URL = databaseUrl();
    return;
  }

  const password = required('OMNIKES_POSTGRES_PASSWORD');
  const passwordFile = ensurePasswordFile(password);

  if (!existsSync(path.join(data, 'PG_VERSION'))) {
    mkdirSync(data, { recursive: true });
    run(bin('initdb'), [
      '-D', data,
      '-U', env('OMNIKES_POSTGRES_USER') || 'omnikes',
      '--pwfile=' + passwordFile,
      '--encoding=UTF8',
      '--no-locale',
    ]);
    console.log('Embedded PostgreSQL cluster initialized.');
  } else {
    console.log('Embedded PostgreSQL cluster already initialized: preserved.');
  }

  const serviceName = env('OMNIKES_POSTGRES_SERVICE_NAME') || 'OmniKesPostgreSQL';
  if (process.platform === 'win32') {
    run(bin('pg_ctl'), [
      'register',
      '-D', data,
      '-N', serviceName,
      '-S', 'auto',
      '-o', `-p ${port}`,
    ]);
  }

  const logFile = path.join(data, 'omnikes-postgresql.log');
  run(bin('pg_ctl'), ['start', '-D', data, '-l', logFile, '-w', '-o', `-p ${port}`]);

  const url = databaseUrl();
  process.env.DATABASE_URL = url;

  const envPath = path.resolve('.env');
  if (!existsSync(envPath)) {
    const lines = [
      `DATABASE_URL="${url}"`,
      'NODE_ENV="production"',
      'NEXT_PUBLIC_APP_URL="http://localhost:3000"',
      `SESSION_SECRET="${crypto.randomBytes(32).toString('hex')}"`,
      `AUTH_SECRET="${crypto.randomBytes(32).toString('hex')}"`,
      '',
    ];
    writeFileSync(envPath, lines.join('\n'), { encoding: 'utf8', flag: 'wx' });
    console.log('.env created for embedded PostgreSQL.');
  } else {
    console.log('.env already exists: preserved without modification.');
  }

  console.log('Embedded PostgreSQL: PASS');
}

main().catch((error) => {
  console.error('Embedded PostgreSQL: FAIL', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
