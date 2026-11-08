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
const appPortFile = path.join(omniKesDataDir, 'app-port.txt');
const minAppPort = 3001;
const maxAppPort = 3099;
const minPort = 5433;
const maxPort = 5532;
const dbPasswordFile = path.join(omniKesDataDir, '.omnikes-pg-password');
const legacyDbPasswordFile = path.join(data, '.omnikes-pg-password');
const envPath = path.join(app, '.env');
let port = null;
const logFile = path.join(omniKesDataDir, 'logs', 'runtime-install.log');

function writeLog(message) {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, '[' + new Date().toISOString() + '] ' + String(message) + '\r\n', 'utf8');
  } catch {
    // Logging must never hide the original installer error.
  }
}

function run(file, args, env, cwd) {
  writeLog('Running ' + path.basename(file) + ' ' + args.join(' ') + (cwd ? ' (cwd: ' + cwd + ')' : ''));
  try {
    const output = execFileSync(file, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: env || process.env,
      ...(cwd ? { cwd } : {}),
    });
    if (output) writeLog(output.trim());
  } catch (error) {
    if (error && error.stdout) writeLog('STDOUT: ' + String(error.stdout));
    if (error && error.stderr) writeLog('STDERR: ' + String(error.stderr));
    writeLog('COMMAND FAILED: ' + (error instanceof Error ? error.stack || error.message : String(error)));
    throw error;
  }
}

process.on('uncaughtException', (error) => {
  writeLog('FATAL: ' + (error instanceof Error ? error.stack || error.message : String(error)));
  console.error('OmniKes runtime installation failed. Diagnostic log: ' + logFile);
  process.exit(1);
});

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

function chooseAppPort() {
  for (let candidate = minAppPort; candidate <= maxAppPort; candidate += 1) {
    if (!portIsListening(candidate)) return candidate;
  }
  throw new Error('No free OmniKes application port is available in the reserved range 3001-3099.');
}

function securePasswordFile() {
  if (process.platform !== 'win32' || !exists(dbPasswordFile)) return;
  // The PostgreSQL service does not need this credential file after startup.
  // Restrict access to LocalSystem and the local Administrators group.
  run('icacls.exe', [
    dbPasswordFile,
    '/inheritance:r',
    '/grant:r',
    '*S-1-5-18:(F)',
    '*S-1-5-32-544:(F)',
  ]);
}

function setEnvValue(content, key, value) {
  const line = key + '="' + String(value).replace(/"/g, '') + '"';
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex((existing) => existing.startsWith(key + '='));
  if (index >= 0) lines[index] = line;
  else lines.push(line);
  return lines.join('\n').replace(/\n*$/, '') + '\n';
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
writeLog('=== OmniKes PostgreSQL runtime installation started ===');
writeLog('Install home: ' + home);
writeLog('PostgreSQL data directory: ' + data);

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
  writeLog('No existing PostgreSQL cluster detected; initializing a new cluster without deleting existing files.');
  const remainingEntries = fs.readdirSync(data);
  if (remainingEntries.length > 0) {
    throw new Error('PostgreSQL data directory is not empty and has no PG_VERSION. Preserved existing contents: ' + remainingEntries.join(', ') + '. Refusing to delete or overwrite these files.');
  }
  if (!exists(pg('initdb'))) throw new Error('Embedded PostgreSQL runtime is missing initdb.exe');
  run(pg('initdb'), ['-D', data, '-U', dbUser, '--pwfile=' + dbPasswordFile, '--encoding=UTF8', '--no-locale']);
}

// initdb must be able to read the password file under the installer account.
// Restrict it only after cluster initialization; keep the restriction on upgrades too.
securePasswordFile();

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
writeLog('PostgreSQL service is accepting authenticated connections on port ' + port + '.');

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
const savedAppPort = exists(appPortFile) ? Number(fs.readFileSync(appPortFile, 'utf8').trim()) : null;
if (savedAppPort !== null && (!Number.isInteger(savedAppPort) || savedAppPort < minAppPort || savedAppPort > maxAppPort)) {
  throw new Error('The saved OmniKes application port is invalid. Refusing to overwrite the existing application configuration.');
}
const appPort = savedAppPort && !portIsListening(savedAppPort) ? savedAppPort : chooseAppPort();
const url = 'postgresql://' + encodeURIComponent(dbUser) + ':' + encodeURIComponent(password) + '@127.0.0.1:' + port + '/' + dbName;
let envContent = exists(envPath) ? fs.readFileSync(envPath, 'utf8') : [
  'NODE_ENV="production"',
  'SESSION_SECRET="' + crypto.randomBytes(32).toString('hex') + '"',
  'AUTH_SECRET="' + crypto.randomBytes(32).toString('hex') + '"',
  '',
].join('\n');
envContent = setEnvValue(envContent, 'DATABASE_URL', url);
envContent = setEnvValue(envContent, 'PORT', appPort);
envContent = setEnvValue(envContent, 'NEXT_PUBLIC_APP_URL', 'http://127.0.0.1:' + appPort);
if (!exists(envPath)) fs.writeFileSync(envPath, envContent, { flag: 'wx' });
else if (fs.readFileSync(envPath, 'utf8') !== envContent) fs.writeFileSync(envPath, envContent);
fs.writeFileSync(portFile, String(port) + '\n');
fs.writeFileSync(appPortFile, String(appPort) + '\n');

const prismaCli = path.join(app, 'node_modules', 'prisma', 'build', 'index.js');
const schema = path.join(app, 'prisma', 'schema.prisma');
const migrations = path.join(app, 'prisma', 'migrations');
if (!exists(prismaCli)) throw new Error('Prisma CLI is missing from the offline package.');
if (!exists(schema)) throw new Error('Prisma schema.prisma is missing from the offline package.');
if (!exists(migrations)) throw new Error('Prisma migrations are missing from the offline package.');

process.env.DATABASE_URL = url;
writeLog('Applying packaged Prisma migrations.');
run(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schema], { ...process.env, DATABASE_URL: url }, app);
writeLog('Prisma migrations completed.');

const rbacInitializer = path.join(__dirname, 'initialize-rbac.cjs');
if (!exists(rbacInitializer)) throw new Error('RBAC initializer is missing from the offline package.');
run(process.execPath, [rbacInitializer], { ...process.env, DATABASE_URL: url });
writeLog('RBAC permission catalogue initialization completed.');
writeLog('=== OmniKès PostgreSQL runtime installation: PASS ===');
console.log('OmniKès offline runtime installation and PostgreSQL service initialization: PASS');
