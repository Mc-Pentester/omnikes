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
const dbPasswordFile = path.join(data, '.omnikes-pg-password');
const envPath = path.join(app, '.env');
const port = 5432;

function exists(file) { return fs.existsSync(file); }
function pg(file) {
  return path.join(pgBin, process.platform === 'win32' ? file + '.exe' : file);
}
function run(file, args, env) {
  if (!exists(file) && !['sc.exe'].includes(path.basename(file).toLowerCase())) {
    throw new Error('Executable introuvable : ' + file);
  }
  execFileSync(file, args, { stdio: 'inherit', windowsHide: true, env: env || process.env });
}
function runCapture(file, args, env) {
  return execFileSync(file, args, { encoding: 'utf8', windowsHide: true, env: env || process.env }).trim();
}

for (const required of [pg('initdb'), pg('pg_ctl'), pg('psql')]) {
  if (!exists(required)) throw new Error('Fichier PostgreSQL manquant : ' + required);
}
if (!exists(app)) throw new Error('Dossier applicatif manquant : ' + app);
fs.mkdirSync(data, { recursive: true });

let password;
if (exists(dbPasswordFile)) {
  password = fs.readFileSync(dbPasswordFile, 'utf8').trim();
} else if (exists(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const line = envContent.split(/\r?\n/).find((x) => x.startsWith('OMNIKES_POSTGRES_PASSWORD='));
  password = line?.slice('OMNIKES_POSTGRES_PASSWORD='.length).replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  if (password) fs.writeFileSync(dbPasswordFile, password + '\n', { flag: 'wx', mode: 0o600 });
}
if (!password) {
  if (exists(path.join(data, 'PG_VERSION'))) {
    throw new Error('Le cluster PostgreSQL existe mais son mot de passe OmniKes est introuvable. Aucune donnée n’a été modifiée.');
  }
  password = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(dbPasswordFile, password + '\n', { flag: 'wx', mode: 0o600 });
}

if (!exists(path.join(data, 'PG_VERSION'))) {
  run(pg('initdb'), ['-D', data, '-U', dbUser, '--pwfile=' + dbPasswordFile, '--encoding=UTF8', '--no-locale']);
}

let serviceExists = false;
try {
  runCapture('sc.exe', ['query', 'OmniKesPostgreSQL']);
  serviceExists = true;
} catch {}
if (!serviceExists) {
  run(pg('pg_ctl'), ['register', '-D', data, '-N', 'OmniKesPostgreSQL', '-S', 'auto', '-o', '-p ' + port]);
}

try {
  run('sc.exe', ['config', 'OmniKesPostgreSQL', 'start=', 'auto']);
} catch (error) {
  throw new Error('Impossible de configurer le service OmniKesPostgreSQL en démarrage automatique : ' + error.message);
}
try {
  run('sc.exe', ['start', 'OmniKesPostgreSQL']);
} catch {
  // Windows returns a nonzero exit code if the service is already running.
  // The database readiness check below is authoritative.
}

const psql = pg('psql');
const psqlEnv = { ...process.env, PGPASSWORD: password };
let ready = false;
let lastError;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    runCapture(psql, ['-h', '127.0.0.1', '-p', String(port), '-U', dbUser, '-d', 'postgres', '-Atqc', 'SELECT 1'], psqlEnv);
    ready = true;
    break;
  } catch (error) {
    lastError = error;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
}
if (!ready) {
  throw new Error('Le service OmniKesPostgreSQL ne répond pas après 30 secondes. Vérifiez ' + path.join(data, 'omnikes-postgresql.log') + '. Détail : ' + (lastError?.message || 'connexion impossible'));
}

let dbExists;
try {
  dbExists = runCapture(psql, ['-h', '127.0.0.1', '-p', String(port), '-U', dbUser, '-d', 'postgres', '-Atqc', "SELECT 1 FROM pg_database WHERE datname = 'omnikes'"], psqlEnv);
} catch (error) {
  throw new Error('Connexion PostgreSQL réussie au démarrage mais impossible de vérifier la base : ' + error.message);
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
}

const prismaCli = path.join(app, 'node_modules', 'prisma', 'build', 'index.js');
const schema = path.join(app, 'prisma', 'schema.prisma');
const migrations = path.join(app, 'prisma', 'migrations');
if (!exists(prismaCli)) throw new Error('Prisma CLI manquant : ' + prismaCli);
if (!exists(schema)) throw new Error('Schéma Prisma manquant : ' + schema);
if (!exists(migrations)) throw new Error('Dossier des migrations Prisma manquant : ' + migrations);

process.env.DATABASE_URL = url;
run(process.execPath, [prismaCli, 'migrate', 'deploy']);
console.log('Installation du runtime PostgreSQL OmniKes : PASS');
