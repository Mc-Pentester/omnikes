/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const home = path.resolve(__dirname, '..');
const app = path.join(home, 'app');
const runtime = path.join(home, 'runtime');
const pgBin = path.join(runtime, 'postgresql', 'bin');
const data = path.join(process.env.ProgramData || 'C:\\ProgramData', 'OmniKes', 'postgresql-data');
const dbUser = 'omnikes';
const dbName = 'omnikes';
const serviceName = 'OmniKesPostgreSQL';
const dbPasswordFile = path.join(data, '.omnikes-pg-password');
const envPath = path.join(app, '.env');
const port = 5432;

function run(file, args, env) {
  execFileSync(file, args, { stdio: 'inherit', windowsHide: true, env: env || process.env });
}

function pg(file) {
  return path.join(pgBin, process.platform === 'win32' ? file + '.exe' : file);
}

function exists(file) { return fs.existsSync(file); }

function serviceState() {
  try {
    return execFileSync('sc.exe', ['query', serviceName], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (error && error.status === 1060) return '';
    throw error;
  }
}

function waitForPostgres(password) {
  const ready = pg('pg_isready');
  if (!exists(ready)) throw new Error('Embedded PostgreSQL runtime is missing pg_isready.exe');
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      execFileSync(ready, ['-h', '127.0.0.1', '-p', String(port), '-t', '2'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      const psql = pg('psql');
      execFileSync(psql, ['-h', '127.0.0.1', '-p', String(port), '-U', dbUser, '-d', 'postgres', '-Atqc', 'SELECT 1'], {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PGPASSWORD: password },
      });
      return;
    } catch {
      // The Windows service may need a few seconds to initialize its data directory.
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  throw new Error('Windows service OmniKesPostgreSQL did not become ready on 127.0.0.1:5432 within 30 seconds.');
}

fs.mkdirSync(data, { recursive: true });

let password;
if (exists(dbPasswordFile)) {
  password = fs.readFileSync(dbPasswordFile, 'utf8').trim();
} else if (exists(envPath)) {
  const line = fs.readFileSync(envPath, 'utf8').split(/\\r?\\n/).find((x) => x.startsWith('OMNIKES_POSTGRES_PASSWORD='));
  password = line?.split('=').slice(1).join('=').replace(/^"|"$/g, '');
  if (password) fs.writeFileSync(dbPasswordFile, password + '\\n', { flag: 'wx', mode: 0o600 });
}
if (!password) {
  if (exists(path.join(data, 'PG_VERSION'))) {
    throw new Error('Existing PostgreSQL cluster has no preserved OmniKès password file; refusing to guess or overwrite credentials.');
  }
  password = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(dbPasswordFile, password + '\\n', { flag: 'wx', mode: 0o600 });
}

if (!exists(path.join(data, 'PG_VERSION'))) {
  if (!exists(pg('initdb'))) throw new Error('Embedded PostgreSQL runtime is missing initdb.exe');
  run(pg('initdb'), ['-D', data, '-U', dbUser, '--pwfile=' + dbPasswordFile, '--encoding=UTF8', '--no-locale']);
}

let state = serviceState();
if (!state) {
  if (!exists(pg('pg_ctl'))) throw new Error('Embedded PostgreSQL runtime is missing pg_ctl.exe');
  run(pg('pg_ctl'), ['register', '-D', data, '-N', serviceName, '-S', 'auto', '-o', '-p ' + port]);
  state = serviceState();
  if (!state) throw new Error('PostgreSQL service registration did not create Windows service OmniKesPostgreSQL.');
}

try {
  run('sc.exe', ['start', serviceName]);
} catch (error) {
  const current = serviceState();
  if (!current.includes('RUNNING')) throw error;
}
waitForPostgres(password);

const psql = pg('psql');
const psqlEnv = { ...process.env, PGPASSWORD: password };
let dbExists = '';
try {
  dbExists = execFileSync(psql, ['-h', '127.0.0.1', '-p', String(port), '-U', dbUser, '-d', 'postgres', '-Atqc', "SELECT 1 FROM pg_database WHERE datname = 'omnikes'"], { encoding: 'utf8', windowsHide: true, env: psqlEnv }).trim();
} catch {
  throw new Error('Unable to authenticate to the embedded PostgreSQL Windows service.');
}
if (dbExists !== '1') {
  run(psql, ['-h', '127.0.0.1', '-p', String(port), '-U', dbUser, '-d', 'postgres', '-c', 'CREATE DATABASE omnikes'], psqlEnv);
}
const url = 'postgresql://' + encodeURIComponent(dbUser) + ':' + encodeURIComponent(password) + '@127.0.0.1:' + port + '/' + dbName;
if (!exists(envPath)) {
  fs.writeFileSync(envPath, [
    'DATABASE_URL="' + url + '"',
    'NODE_ENV="production"',
    'NEXT_PUBLIC_APP_URL="http://127.0.0.1:3000"',
    'SESSION_SECRET="' + crypto.randomBytes(32).toString('hex') + '"',
    'AUTH_SECRET="' + crypto.randomBytes(32).toString('hex') + '"',
    ''
  ].join('\\n'), { flag: 'wx' });
}

const prismaCli = path.join(app, 'node_modules', 'prisma', 'build', 'index.js');
const schema = path.join(app, 'prisma', 'schema.prisma');
const migrations = path.join(app, 'prisma', 'migrations');
if (!exists(prismaCli)) throw new Error('Prisma CLI is missing from the offline package.');
if (!exists(schema)) throw new Error('Prisma schema.prisma is missing from the offline package.');
if (!exists(migrations)) throw new Error('Prisma migrations are missing from the offline package.');

process.env.DATABASE_URL = url;
run(process.execPath, [prismaCli, 'migrate', 'deploy']);

const rbacInitializer = path.join(__dirname, 'initialize-rbac.cjs');
if (!exists(rbacInitializer)) throw new Error('RBAC initializer is missing from the offline package.');
run(process.execPath, [rbacInitializer], { ...process.env, DATABASE_URL: url });
console.log('OmniKès offline runtime installation and PostgreSQL service initialization: PASS');
