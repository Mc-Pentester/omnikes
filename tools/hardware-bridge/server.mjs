import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);
const HOST = process.env.OMNIKES_HARDWARE_BRIDGE_HOST ?? '127.0.0.1';
const PORT = Number(process.env.OMNIKES_HARDWARE_BRIDGE_PORT ?? 8765);
const ALLOWED_ORIGIN = process.env.OMNIKES_HARDWARE_BRIDGE_ORIGIN ?? 'http://localhost:3000';
const MAX_BODY_BYTES = 1024 * 1024;

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  });
  res.end(body);
}

function originAllowed(req) {
  const origin = req.headers.origin;
  return !origin || origin === ALLOWED_ORIGIN;
}

async function readJson(req) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function listPrinters() {
  const script = [
    '$ErrorActionPreference = "Stop"',
    'Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus | ConvertTo-Json -Compress'
  ].join('; ');
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true, maxBuffer: 1024 * 1024 });
  if (!stdout.trim()) return [];
  const parsed = JSON.parse(stdout);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function printRaw(printerId, data) {
  if (!printerId || typeof printerId !== 'string' || printerId.length > 200) {
    throw new Error('printerId is required');
  }
  if (!Buffer.isBuffer(data) || data.length === 0) throw new Error('Print data is empty');

  const dir = await mkdtemp(join(tmpdir(), 'omnikes-hw-'));
  const file = join(dir, 'print.bin');
  try {
    await writeFile(file, data);
    const scriptPath = join(new URL('.', import.meta.url).pathname.replace(/^\//, ''), 'print-raw.ps1');
    await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-PrinterName', printerId,
      '-FilePath', file,
    ], { windowsHide: true, maxBuffer: 1024 * 1024 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function handle(req, res) {
  if (!originAllowed(req)) return json(res, 403, { error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true, version: '1.0.0', platform: process.platform });
  }

  if (req.method === 'GET' && url.pathname === '/v1/printers') {
    if (process.platform !== 'win32') return json(res, 501, { error: 'Windows print bridge is required on this host' });
    return json(res, 200, { printers: await listPrinters() });
  }

  if (req.method === 'POST' && url.pathname === '/v1/printers/print') {
    if (process.platform !== 'win32') return json(res, 501, { error: 'Windows print bridge is required on this host' });
    const body = await readJson(req);
    if (body?.encoding !== 'base64' || typeof body?.data !== 'string') {
      return json(res, 400, { error: 'Expected base64 print payload' });
    }
    const data = Buffer.from(body.data, 'base64');
    if (data.length === 0 || data.length > 512 * 1024) return json(res, 400, { error: 'Print payload must be between 1 byte and 512 KiB' });
    await printRaw(body.printerId, data);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: 'Not found' });
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error('[OmniKes Hardware Bridge]', error instanceof Error ? error.message : error);
    if (!res.headersSent) json(res, 500, { error: 'Hardware bridge operation failed' });
    else res.end();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`OmniKès Hardware Bridge listening on http://${HOST}:${PORT}`);
  console.log(`Allowed browser origin: ${ALLOWED_ORIGIN}`);
});
