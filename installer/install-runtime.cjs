/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { execFileSync } = require('node:child_process');

const home = path.resolve(__dirname, '..');
const app = path.join(home, 'app');
const runtime = path.join(home, 'runtime');
const pgBin = path.join(runtime, 'postgresql', 'bin');
const programData = process.env.ProgramData || 'C:\\ProgramData';
const omniKesData = path.join(programData, 'OmniKes');
const data = path.join(omniKesData, 'postgresql-data');
const portFile = path.join(omniKesData, 'postgresql-port');
const dbUser = 'omnikes';
const dbName = 'omnikes';
const serviceName = 'OmniKesPostgreSQL';
const dbPasswordFile = path.join(data, '.omnikes-pg-password');
const envPath = path.join(app, '.env');

function run(file, args, env) {
  execFileSync(file, args, { stdio: 'inherit', windowsHide: true, env: env || process.env });
}

function capture(file, args, env) {
  return execFileSync(file, args, { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: env || process.env });
}

function pg(file) {
  return path.join(pgBin, process.platform === 'win32' ? file + '.exe' : file);
}

function exists(file) { return fs.existsSync(file); }

function readEnvValue(name) {
  if (!exists(envPath)) return undefined;
  const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find((entry) => entry.startsWith(name + '='));
  if (!line) return undefined;
  return line.slice(name.length + 1).trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

function normalizePath(value) {
  return path.resolve(value.trim().replace(/^"|"$/g, '')).replace(/[\\/]+$/, '').toLowerCase();
}

function readServiceConfig() {
  try {
    return capture('sc.exe', ['qc', serviceName]);
  } catch (error) {
    const output = String(error && (error.stdout || error.stderr) || '');
    if (/1060|does not exist|not exist/i.test(output)) return null;
    throw new Error('Unable to inspect the Windows PostgreSQL service safely.');
  }
}

function assertServiceBelongsToThisInstall(config) {
  const normalized = config.toLowerCase();
  if (!normalized.includes(path.resolve(pg('pg_ctl')).toLowerCase()) ||
      !normalized.includes(normalizePath(data))) {
    throw new Error(
      'The Windows service OmniKesPostgreSQL already exists but does not point to this OmniKès runtime and data directory. It was left untouched.'
    );
  }
}

function readPort() {
  if (!exists(portFile)) return null;
  const raw = fs.readFileSync(portFile, 'utf8').trim();
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error('The saved OmniKès PostgreSQL port is invalid; refusing to guess or change it.');
  }
  return value;
}

async function choosePort() {
  for (let candidate = 5433; candidate <= 5532; candidate += 1) {
    if (await isPortFree(candidate)) return candidate;
  }
  throw new Error('No free local PostgreSQL port was found between 5433 and 5532. No existing service was changed.');
}

async function verifyOwnServer(port, password) {
  const psql = pg('psql');
  const psqlEnv = { ...process.env, PGPASSWORD: password };
  let output;
  try {
    output = capture(psql, [
      '-h', '127.0.0.1', '-p', String(port), '-U', dbUser, '-d', 'postgres',
      '-Atqc', 'SELECT current_user; SHOW data_directory; SHOW port',
    ], psqlEnv);
  } catch {
    throw new Error(
      'A process is already listening on the saved OmniKès PostgreSQL port, but its credentials could not be verified. It was not stopped or modified.'
    );
  }
  const lines = output.trim().split(/\r?\n/);
  if (lines[0] !== dbUser || lines.length < 3 ||
      normalizePath(lines[1]) !== normalizePath(data) ||
      Number(lines[2]) !== port) {
    throw new Error(
      'The service listening on the saved port is not the expected OmniKès database. It was left untouched.'
    );
  }
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('The packaged OmniKès runtime installer is intended for Windows.');
  }
  if (exists(envPath) && !exists(dbPasswordFile)) {
    throw new Error('An existing app/.env was found without the installer-managed database password file. It was preserved; refusing to initialize or migrate any database.');
  }

  fs.mkdirSync(omniKesData, { recursive: true });
  fs.mkdirSync(data, { recursive: true });

  let password;
  if (exists(dbPasswordFile)) {
    password = fs.readFileSync(dbPasswordFile, 'utf8').trim();
    if (!password) throw new Error('The saved OmniKès PostgreSQL password file is empty; refusing to regenerate credentials.');
  } else {
    if (exists(path.join(data, 'PG_VERSION'))) {
      throw new Error('Existing PostgreSQL data has no preserved OmniKès password file; refusing to guess, reset, or overwrite credentials.');
    }
    password = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(dbPasswordFile, password + '\n', { flag: 'wx', mode: 0o600 });
  }

  const clusterExists = exists(path.join(data, 'PG_VERSION'));
  let port = readPort();
  if (port === null) {
    if (clusterExists) {
      throw new Error('Existing PostgreSQL data has no saved port file; refusing to guess the port or modify the cluster.');
    }
    port = await choosePort();
    fs.writeFileSync(portFile, String(port) + '\n', { flag: 'wx' });
  }

  const url = 'postgresql://' + encodeURIComponent(dbUser) + ':' + encodeURIComponent(password) + '@127.0.0.1:' + port + '/' + dbName;
  if (exists(envPath) && readEnvValue('DATABASE_URL') !== url) {
    throw new Error('The existing app/.env points to a different database. It was preserved; refusing to initialize, start, or migrate a different database.');
  }

  const serviceConfig = readServiceConfig();
  if (serviceConfig) assertServiceBelongsToThisInstall(serviceConfig);

  if (!clusterExists) {
    if (!exists(pg('initdb'))) throw new Error('Embedded PostgreSQL runtime is missing initdb.exe');
    run(pg('initdb'), ['-D', data, '-U', dbUser, '--pwfile=' + dbPasswordFile, '--encoding=UTF8', '--no-locale']);
  }

  const psqlEnv = { ...process.env, PGPASSWORD: password };
  if (!(await isPortFree(port))) {
    await verifyOwnServer(port, password);
  } else {
    if (!serviceConfig) {
      run(pg('pg_ctl'), ['register', '-D', data, '-N', serviceName, '-S', 'auto', '-o', '-p ' + port]);
    }
    try {
      run('sc.exe', ['start', serviceName]);
    } catch {
      // The service may have started between the port check and this request.
    }
    let ready = false;
    for (let attempt = 0; attempt < 45; attempt += 1) {
      if (!(await isPortFree(port))) {
        await verifyOwnServer(port, password);
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!ready) throw new Error('The embedded PostgreSQL Windows service did not become ready within 45 seconds. Existing data was preserved.');
  }

  const psql = pg('psql');
  let dbExists = '';
  try {
    dbExists = capture(psql, [
      '-h', '127.0.0.1', '-p', String(port), '-U', dbUser, '-d', 'postgres',
      '-Atqc', "SELECT 1 FROM pg_database WHERE datname = 'omnikes'",
    ]).trim();
  } catch {
    throw new Error('Unable to verify the OmniKès database on its own PostgreSQL instance.');
  }
  if (dbExists !== '1') {
    run(psql, ['-h', '127.0.0.1', '-p', String(port), '-U', dbUser, '-d', 'postgres', '-c', 'CREATE DATABASE omnikes'], psqlEnv);
  }

  if (!exists(envPath)) {
    fs.writeFileSync(envPath, [
      'DATABASE_URL="' + url + '"',
      'NODE_ENV="production"',
      'NEXT_PUBLIC_APP_URL="http://127.0.0.1:3000"',
      'SESSION_SECRET="' + crypto.randomBytes(32).toString('hex') + '"',
      'AUTH_SECRET="' + crypto.randomBytes(32).toString('hex') + '"',
      '',
    ].join('\n'), { flag: 'wx' });
  } else {
    const existingUrl = readEnvValue('DATABASE_URL');
    if (existingUrl !== url) {
      throw new Error('The existing app/.env points to a different database. It was preserved; refusing to migrate a database different from the one OmniKès will use.');
    }
  }

  const prismaCli = path.join(app, 'node_modules', 'prisma', 'build', 'index.js');
  const migrations = path.join(app, 'prisma', 'migrations');
  if (!exists(prismaCli)) throw new Error('Prisma CLI is missing from the offline package.');
  if (!exists(migrations)) throw new Error('Prisma migrations are missing from the offline package.');

  run(process.execPath, [prismaCli, 'migrate', 'deploy'], { ...process.env, DATABASE_URL: url });

  const setupCli = path.join(__dirname, 'first-run-setup.cjs');
  const setupConfig = process.argv[2];
  if (!exists(setupCli)) throw new Error('The secure first-run setup helper is missing from the offline package.');
  if (!setupConfig || !exists(setupConfig)) throw new Error('The first-run setup form was not supplied; refusing to finish an incomplete installation.');
  run(process.execPath, [setupCli, setupConfig], { ...process.env, DATABASE_URL: url });

  console.log('OmniKès PostgreSQL runtime configured safely.');
  console.log('Saved local database port:', port);
  console.log('Existing data directory preserved; no database reset or drop was performed.');
  console.log('OmniKès runtime installation: PASS');
}

main().catch((error) => {
  console.error('OmniKès runtime installation: FAIL', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
