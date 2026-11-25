import net from 'node:net';
import { Client } from 'pg';

const host = process.env.OMNIKES_POSTGRES_HOST?.trim() || '127.0.0.1';
const port = Number(process.env.OMNIKES_POSTGRES_PORT || '5432');
const databaseUrl = process.env.DATABASE_URL?.trim();

function checkTcpConnection(): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`PostgreSQL TCP check timed out at ${host}:${port}`));
    }, 5000);
    socket.once('connect', () => { clearTimeout(timer); socket.end(); resolve(); });
    socket.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
}

async function main() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('OMNIKES_POSTGRES_PORT must be a valid TCP port');
  await checkTcpConnection();
  console.log(`PostgreSQL TCP endpoint reachable: ${host}:${port}`);
  if (!databaseUrl) {
    console.log('Database authentication not tested: DATABASE_URL is not set.');
    console.log('Non-destructive check: no database was created, migrated, reset, or modified.');
    return;
  }
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const result = await client.query<{ version: string }>('SELECT version()');
    console.log('PostgreSQL authentication: PASS');
    console.log(`Server: ${result.rows[0]?.version?.split(' on ')[0] ?? 'unknown'}`);
  } finally { await client.end().catch(() => undefined); }
  console.log('Local PostgreSQL preflight: PASS');
  console.log('No database was created, dropped, reset, or modified.');
}

main().catch((error) => {
  console.error('Local PostgreSQL preflight: FAIL', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
