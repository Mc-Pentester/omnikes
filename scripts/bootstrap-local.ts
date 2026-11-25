import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Client } from 'pg';
import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function secret(): string {
  return crypto.randomBytes(32).toString('hex');
}

function quoteIdentifier(value: string): string {
  return '"' + value.replace(/"/g, '""') + '"';
}

function adminUrlFor(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.pathname = '/postgres';
  return url.toString();
}

function ensureEnvFile(): string {
  const envPath = path.resolve('.env');
  if (existsSync(envPath)) {
    console.log('.env already exists: preserved without modification.');
    return process.env.DATABASE_URL?.trim() || required('DATABASE_URL');
  }

  const databaseUrl = process.env.OMNIKES_BOOTSTRAP_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      'No .env and no database URL supplied. Set OMNIKES_BOOTSTRAP_DATABASE_URL or DATABASE_URL before bootstrap.'
    );
  }

  const lines = [
    `DATABASE_URL="${databaseUrl.replace(/"/g, '\\\"')}"`,
    'NODE_ENV="production"',
    'NEXT_PUBLIC_APP_URL="http://localhost:3000"',
    `SESSION_SECRET="${secret()}"`,
    `AUTH_SECRET="${secret()}"`,
    '',
  ];

  writeFileSync(envPath, lines.join('\n'), { encoding: 'utf8', flag: 'wx' });
  process.env.DATABASE_URL = databaseUrl;
  console.log('.env created safely (existing .env would never be overwritten).');
  return databaseUrl;
}

async function ensureDatabase(databaseUrl: string): Promise<void> {
  const target = new URL(databaseUrl);
  const databaseName = decodeURIComponent(target.pathname.replace(/^\//, ''));
  if (!databaseName) throw new Error('DATABASE_URL must contain a database name');

  const adminUrl = process.env.OMNIKES_POSTGRES_ADMIN_URL?.trim() || adminUrlFor(databaseUrl);
  const client = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 5000 });

  try {
    await client.connect();
    const result = await client.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists',
      [databaseName],
    );

    if (result.rows[0]?.exists) {
      console.log(`PostgreSQL database "${databaseName}" already exists: preserved.`);
      return;
    }

    await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    console.log(`PostgreSQL database "${databaseName}" created.`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

function run(command: string, args: string[]): void {
  const executable = process.platform === 'win32' && (command === 'npm' || command === 'npx')
    ? `${command}.cmd`
    : command;
  console.log(`> ${executable} ${args.join(' ')}`);
  execFileSync(executable, args, { stdio: 'inherit', env: process.env, windowsHide: false });
}

async function main() {
  const databaseUrl = ensureEnvFile();
  process.env.DATABASE_URL = databaseUrl;

  await ensureDatabase(databaseUrl);

  run('npx', ['prisma', 'migrate', 'deploy']);
  run('npm', ['run', 'install:local']);

  console.log('');
  console.log('========================================');
  console.log('OmniKès Local-First bootstrap: PASS');
  console.log('========================================');
  console.log('Database: ready');
  console.log('Migrations: applied');
  console.log('Organization/store/admin: provisioned');
  console.log('Cloud: disabled');
  console.log('Online store: disabled');
  console.log('No database reset or drop was performed.');
}

main()
  .catch((error) => {
    console.error('OmniKès Local-First bootstrap: FAIL', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
