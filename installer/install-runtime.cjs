/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const home = path.resolve(__dirname, '..');
const app = path.join(home, 'app');
const runtime = path.join(home, 'runtime');
const pgBin = path.join(runtime, 'postgresql', 'bin');
const programDataArg = process.argv.indexOf('--program-data-dir');
const programDataDir = programDataArg >= 0 && process.argv[programDataArg + 1]
  ? path.resolve(process.argv[programDataArg + 1])
  : (process.env.ProgramData || 'C:\\ProgramData');
const omniKesDataDir = path.join(programDataDir, 'OmniKes');
const data = path.join(omniKesDataDir, 'postgresql-data');
const dbUser = 'omnikes';
const dbName = 'omnikes';
const serviceName = 'OmniKesPostgreSQL';
const portFile = path.join(omniKesDataDir, 'postgresql-port.txt');
const minPort = 5433;
const maxPort = 5532;
const dbPasswordFile = path.join(omniKesDataDir, '.omnikes-pg-password');
const legacyDbPasswordFile = path.join(data, '.omnikes-pg-password');
const envPath = path.join(app, '.env');
let port = null;

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

function portIsListening(candidate) {
  try {
    const output = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], {
      encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split(/\r?\n/).some((line) => {
      if (!/\sLISTENING\s/i.test(line)) return false;
      const columns = line.trim().split(/\s+/);
      const local = columns[1] || '';
      return local.endsWith(':' + candidate);
    });
  } catch {
    throw new Error('Unable to inspect TCP listeners before selecting the OmniKes PostgreSQL port.');
  }
}

function choosePort() {
  for (let candidate = minPort; candidate <= maxPort; candidate += 1) {
    if (!portIsListening(candidate)) return candidate;
  }
  throw new Error('No free OmniKes PostgreSQL port is available in the reserved range 5433-5532.');
}

function waitForPostgres(password, targetPort) {
  const ready = pg('pg_isready');
  if (!exists(ready)) throw new Error('Embedded PostgreSQL runtime is missing pg_isready.exe');
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      execFileSync(ready, ['-h', '127.0.0.1', '-p', String(targetPort), '-t', '2'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      const psql = pg('psql');
      execFileSync(psql, ['-h', '127.0.0.1', '-p', String(targetPort), '-U', dbUser, '-d', 'postgres', '-Atqc', 'SELECT 1'], {
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
  throw new Error('Windows service OmniKesPostgreSQL did not become ready on 127.0.0.1:' + targetPort + ' within 30 seconds.');
}

fs.mkdirSync(omniKesDataDir, { recursive: true });
fs.mkdirSync(data, { recursive: true });

// Older installer builds stored the password inside the PostgreSQL data directory.
// Move only this known credential file out before initdb; never clear unknown files.
if (exists(legacyDbPasswordFile)) {
  if (!exists(dbPasswordFile)) {
    fs.renameSync(legacyDbPasswordFile, dbPasswordFile);
  } else {
    const legacyPassword = fs.readFileSync(legacyDbPasswordFile, 'utf8');
    const savedPassword = fs.readFileSync(dbPasswordFile, 'utf8');
    if (legacyPassword !== savedPassword) {
      throw new Error('Conflicting OmniKes PostgreSQL password files were found. Both were preserved; refusing to initialize or change database credentials.');
    }
    fs.unlinkSync(legacyDbPasswordFile);
  }
}

let password;
if (exists(dbPasswordFile)) {
  password = fs.readFileSync(dbPasswordFile, 'utf8').trim();
} else if (exists(envPath)) {
  const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find((x) => x.startsWith('OMNIKES_POSTGRES_PASSWORD='));
  password = line?.split('=').slice(1).join('=').replace(/^"|"$/g, '');
  if (password) fs.writeFileSync(dbPasswordFile, password + '\n', { flag: 'wx', mode: 0o600 });
}
if (!password) {
  if (exists(path.join(data, 'PG_VERSION'))) {
    throw new Error('Existing PostgreSQL cluster has no preserved OmniKès password file; refusing to guess or overwrite credentials.');
  }
  password = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(dbPasswordFile, password + '\n', { flag: 'wx', mode: 0o600 });
}

if (!exists(path.join(data, 'PG_VERSION'))) {
  const remainingEntries = fs.readdirSync(data);
  if (remainingEntries.length > 0) {
    throw new Error('PostgreSQL data directory is not empty and has no PG_VERSION. Preserved existing contents: ' + remainingEntries.join(', ') + '. Refusing to delete or overwrite these files.');
  }
  if (!exists(pg('initdb'))) throw new Error('Embedded PostgreSQL runtime is missing initdb.exe');
  run(pg('initdb'), ['-D', data, '-U', dbUser, '--pwfile=' + dbPasswordFile, '--encoding=UTF8', '--no-locale']);
}

let state = serviceState();
const savedPort = exists(portFile) ? Number(fs.readFileSync(portFile, 'utf8').trim()) : null;
if (savedPort && (!Number.isInteger(savedPort) || savedPort < minPort || savedPort > maxPort)) {
  throw new Error('The saved OmniKes PostgreSQL port is invalid. Refusing to overwrite the existing database configuration.');
}

if (savedPort && state && state.includes('RUNNING')) {
  try {
    waitForPostgres(password, savedPort);
    port = savedPort;
  } catch {
    port = choosePort();
  }
} else if (savedPort && !portIsListening(savedPort)) {
  port = savedPort;
} else {
  port = choosePort();
}

const mustRegister = !state || !savedPort || port !== savedPort;
if (mustRegister && state) {
  try { run('sc.exe', ['stop', serviceName]); } catch {}
  const stopDeadline = Date.now() + 30000;
  while (Date.now() < stopDeadline && serviceState().includes('RUNNING')) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  run(pg('pg_ctl'), ['unregister', '-N', serviceName]);
}
if (mustRegister) {
  if (!exists(pg('pg_ctl'))) throw new Error('Embedded PostgreSQL runtime is missing pg_ctl.exe');
  if (portIsListening(port)) throw new Error('Selected OmniKes PostgreSQL port ' + port + ' became occupied before service registration.');
  run(pg('pg_ctl'), ['register', '-D', data, '-N', serviceName, '-S', 'auto', '-o', '-p ' + port]);
  state = serviceState();
  if (!state) throw new Error('PostgreSQL service registration did not create Windows service OmniKesPostgreSQL.');
  fs.writeFileSync(portFile, String(port) + '\n', { flag: 'w' });
}

try {
  run('sc.exe', ['start', serviceName]);
} catch (error) {
  const current = serviceState();
  if (!current.includes('RUNNING')) throw error;
}
waitForPostgres(password, port);

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
  ].join('\n'), { flag: 'wx' });
} else {
  const existingEnv = fs.readFileSync(envPath, 'utf8');
  const updatedEnv = existingEnv.match(/^DATABASE_URL=.*$/m)
    ? existingEnv.replace(/^DATABASE_URL=.*$/m, 'DATABASE_URL="' + url + '"')
    : existingEnv.replace(/\s*$/, '') + '\nDATABASE_URL="' + url + '"\n';
  if (updatedEnv !== existingEnv) fs.writeFileSync(envPath, updatedEnv);
}
fs.writeFileSync(portFile, String(port) + '\n');

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
