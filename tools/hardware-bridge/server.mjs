import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const HOST = '127.0.0.1';
const PORT = Number(process.env.OMNIKES_HARDWARE_BRIDGE_PORT ?? 8765);
const ALLOWED_ORIGINS = new Set(
  (process.env.OMNIKES_HARDWARE_BRIDGE_ORIGIN ?? 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_PRINT_BYTES = 512 * 1024;
const VERSION = '1.1.0';

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': res.__origin ?? 'http://localhost:3000',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  });
  res.end(body);
}

function originAllowed(req, res) {
  const origin = req.headers.origin;
  if (!origin) {
    res.__origin = 'http://localhost:3000';
    return true;
  }
  if (!ALLOWED_ORIGINS.has(origin)) return false;
  res.__origin = origin;
  return true;
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
  if (process.platform !== 'win32') {
    throw new Error('The Windows RAW printer bridge requires Windows');
  }

  const script = [
    '$ErrorActionPreference = "Stop"',
    'Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus | ConvertTo-Json -Compress',
  ].join('; ');

  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, maxBuffer: 1024 * 1024 },
  );

  if (!stdout.trim()) return [];
  const parsed = JSON.parse(stdout);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function printRaw(printerId, data) {
  if (
    typeof printerId !== 'string' ||
    printerId.trim().length === 0 ||
    printerId.length > 200
  ) {
    throw new Error('printerId is required');
  }

  const dir = await mkdtemp(join(tmpdir(), 'omnikes-hw-'));
  const file = join(dir, 'print.bin');

  try {
    await writeFile(file, data);
    const scriptPath = fileURLToPath(new URL('./print-raw.ps1', import.meta.url));

    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-PrinterName',
        printerId,
        '-FilePath',
        file,
      ],
      { windowsHide: true, maxBuffer: 1024 * 1024 },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function handle(req, res) {
  if (!originAllowed(req, res)) {
    return json(res, 403, { error: 'Origin not allowed' });
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': res.__origin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    });
    return res.end();
  }

  const url = new URL(req.url ?? '/', 'http://127.0.0.1');

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, {
      ok: true,
      version: VERSION,
      platform: process.platform,
      transport: 'windows-winspool-raw',
    });
  }

  if (req.method === 'GET' && url.pathname === '/v1/printers') {
    return json(res, 200, { printers: await listPrinters() });
  }

  if (req.method === 'POST' && url.pathname === '/v1/printers/print') {
    if (process.platform !== 'win32') {
      return json(res, 501, { error: 'Windows RAW printer bridge requires Windows' });
    }

    const body = await readJson(req);

    if (
      body?.encoding !== 'base64' ||
      typeof body?.data !== 'string'
    ) {
      return json(res, 400, { error: 'Expected a base64 ESC/POS payload' });
    }

    if (body.data.length > Math.ceil(MAX_PRINT_BYTES * 4 / 3)) {
      return json(res, 400, { error: 'Print payload is too large' });
    }

    const data = Buffer.from(body.data, 'base64');

    if (data.length === 0 || data.length > MAX_PRINT_BYTES) {
      return json(res, 400, {
        error: 'Print payload must be between 1 byte and 512 KiB',
      });
    }

    await printRaw(body.printerId, data);

    return json(res, 200, {
      ok: true,
      bytes: data.length,
      printerId: body.printerId,
    });
  }

  return json(res, 404, { error: 'Not found' });
}

if (process.argv.includes('--doctor')) {
  listPrinters()
    .then((printers) => {
      console.log(JSON.stringify({ ok: true, version: VERSION, platform: process.platform, printers }, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(
      '[OmniKès Hardware Bridge]',
      error instanceof Error ? error.message : error,
    );

    if (!res.headersSent) {
      json(res, 500, { error: 'Hardware bridge operation failed' });
    } else {
      res.end();
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`OmniKès Local Hardware Bridge v${VERSION}`);
  console.log(`Listening on http://${HOST}:${PORT}`);
  console.log(`Allowed origins: ${[...ALLOWED_ORIGINS].join(', ')}`);
});
