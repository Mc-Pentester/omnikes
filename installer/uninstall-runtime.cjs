/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const home = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const expectedPgCtl = path.resolve(home, 'runtime', 'postgresql', 'bin', 'pg_ctl.exe').toLowerCase();
const expectedData = path.resolve(process.env.ProgramData || 'C:\\ProgramData', 'OmniKes', 'postgresql-data')
  .replace(/[\\/]+$/, '').toLowerCase();
const serviceName = 'OmniKesPostgreSQL';

function capture(args) {
  return execFileSync('sc.exe', args, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function main() {
  let config;
  try {
    config = capture(['qc', serviceName]).toLowerCase();
  } catch {
    console.log('OmniKès PostgreSQL service is absent; no service changes required.');
    return;
  }

  if (!config.includes(expectedPgCtl) || !config.includes(expectedData)) {
    console.warn('The service name is in use by another runtime or data directory. It was left untouched.');
    return;
  }

  try {
    execFileSync('sc.exe', ['stop', serviceName], { stdio: 'ignore', windowsHide: true });
  } catch {
    // A stopped service can report a non-zero status; query it before deciding.
  }

  try {
    const status = capture(['query', serviceName]).toLowerCase();
    if (status.includes('running') || status.includes('stop_pending')) {
      console.warn('The OmniKès PostgreSQL service did not stop cleanly. The service and data were preserved.');
      return;
    }
  } catch {
    // If the service disappeared, there is nothing left to delete.
    return;
  }

  try {
    execFileSync('sc.exe', ['delete', serviceName], { stdio: 'ignore', windowsHide: true });
    console.log('OmniKès PostgreSQL service removed. Database files in ProgramData were preserved.');
  } catch {
    console.warn('Could not remove the OmniKès PostgreSQL service. Database files were preserved.');
  }
}

main();
