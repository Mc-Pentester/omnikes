import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const VERSION = '18.6';
const BUILD = '5';
const ARCHIVE = `postgresql-${VERSION}-${BUILD}-windows-x64-binaries.zip`;
const URL = `https://get.enterprisedb.com/postgresql/${ARCHIVE}`;
const EXPECTED_SHA256 = 'E2246BA91D22345BC3D017586C09EDE52D9DF180B1EEB480F050445F1CAD84E2';

const root = path.resolve(process.env.OMNIKES_POSTGRES_PACKAGE_DIR || 'vendor/postgresql');
const download = path.join(root, ARCHIVE);
const extracted = path.join(root, 'runtime');

async function downloadFile(): Promise<void> {
  mkdirSync(root, { recursive: true });
  if (existsSync(download)) return;

  const response = await fetch(URL);
  if (!response.ok || !response.body) {
    throw new Error(`PostgreSQL binary download failed: HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(download));
}

function sha256(file: string): string {
  const hash = createHash('sha256');
  hash.update(readFileSync(file));
  return hash.digest('hex').toUpperCase();
}

function extract(): void {
  if (existsSync(extracted)) rmSync(extracted, { recursive: true, force: true });
  mkdirSync(extracted, { recursive: true });
  if (process.platform !== 'win32') {
    throw new Error('Embedded PostgreSQL packaging currently targets Windows x64 only.');
  }
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    'Expand-Archive',
    '-LiteralPath', download,
    '-DestinationPath', extracted,
    '-Force',
  ], { stdio: 'inherit' });
}

function verifyLayout(): void {
  const candidates = [
    path.join(extracted, 'pgsql', 'bin'),
    path.join(extracted, 'bin'),
  ];
  const bin = candidates.find((p) => existsSync(path.join(p, 'postgres.exe')));
  if (!bin) throw new Error('PostgreSQL archive extracted, but postgres.exe was not found.');
  for (const file of ['postgres.exe', 'initdb.exe', 'pg_ctl.exe']) {
    if (!existsSync(path.join(bin, file))) throw new Error(`Missing PostgreSQL runtime binary: ${file}`);
  }
  console.log(`Embedded PostgreSQL runtime: ${bin}`);
}

async function main(): Promise<void> {
  console.log(`Preparing PostgreSQL ${VERSION} Windows x64 binaries`);
  console.log(URL);
  await downloadFile();

  const actual = sha256(download);
  if (actual !== EXPECTED_SHA256) {
    throw new Error(`SHA-256 mismatch: expected ${EXPECTED_SHA256}, got ${actual}`);
  }
  console.log(`SHA-256: ${actual} PASS`);

  extract();
  verifyLayout();

  console.log('EMBEDDED POSTGRESQL PACKAGE: PASS');
}

main().catch((error) => {
  console.error('EMBEDDED POSTGRESQL PACKAGE: FAIL', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
