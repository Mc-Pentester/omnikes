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
const MAX_SCALE_RAW_BYTES = 4096;
const MAX_SCALE_READ_TIMEOUT_MS = 10000;
const VERSION = '1.2.0';

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
    if (total > MAX_BODY_BYTES) {
      throw new Error('Request body too large');
    }
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

async function listSerialPorts() {
  if (process.platform !== 'win32') {
    throw new Error('The Windows scale bridge requires Windows');
  }

  const script = [
    '$ErrorActionPreference = "Stop"',
    'Get-CimInstance Win32_SerialPort | Select-Object DeviceID,Name,Description,Manufacturer,Status | ConvertTo-Json -Compress',
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

function validateScaleOptions(options) {
  if (!options || typeof options !== 'object') {
    throw new Error('Scale configuration is required');
  }

  if (
    typeof options.scaleId !== 'string' ||
    !/^COM[0-9]+$/i.test(options.scaleId) ||
    options.scaleId.length > 20
  ) {
    throw new Error('scaleId must be a valid Windows COM port');
  }

  const baudRate = Number(options.baudRate ?? 9600);
  const dataBits = Number(options.dataBits ?? 8);
  const parity = String(options.parity ?? 'none').toLowerCase();
  const stopBits = Number(options.stopBits ?? 1);
  const readTimeoutMs = Number(options.readTimeoutMs ?? 2500);
  const settleMs = Number(options.settleMs ?? 300);
  const command = typeof options.command === 'string' ? options.command : '';

  if (!Number.isInteger(baudRate) || baudRate < 300 || baudRate > 1000000) {
    throw new Error('Invalid baudRate');
  }

  if (![7, 8].includes(dataBits)) {
    throw new Error('dataBits must be 7 or 8');
  }

  if (!['none', 'odd', 'even', 'mark', 'space'].includes(parity)) {
    throw new Error('Unsupported parity');
  }

  if (![1, 1.5, 2].includes(stopBits)) {
    throw new Error('Unsupported stopBits');
  }

  if (
    !Number.isInteger(readTimeoutMs) ||
    readTimeoutMs < 250 ||
    readTimeoutMs > MAX_SCALE_READ_TIMEOUT_MS
  ) {
    throw new Error('Invalid readTimeoutMs');
  }

  if (!Number.isInteger(settleMs) || settleMs < 0 || settleMs > 5000) {
    throw new Error('Invalid settleMs');
  }

  if (command.length > 100) {
    throw new Error('Scale command is too long');
  }

  return {
    scaleId: options.scaleId.toUpperCase(),
    baudRate,
    dataBits,
    parity,
    stopBits,
    command,
    readTimeoutMs,
    settleMs,
  };
}

async function readScale(options) {
  if (process.platform !== 'win32') {
    throw new Error('The Windows scale bridge requires Windows');
  }

  const validated = validateScaleOptions(options);

  const scriptPath = fileURLToPath(
    new URL('./read-scale.ps1', import.meta.url),
  );

  const { stdout } = await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-PortName',
      validated.scaleId,
      '-BaudRate',
      String(validated.baudRate),
      '-DataBits',
      String(validated.dataBits),
      '-Parity',
      validated.parity,
      '-StopBits',
      String(validated.stopBits),
      '-Command',
      validated.command,
      '-ReadTimeoutMs',
      String(validated.readTimeoutMs),
      '-SettleMs',
      String(validated.settleMs),
    ],
    {
      windowsHide: true,
      maxBuffer: 64 * 1024,
      timeout: validated.readTimeoutMs + 5000,
    },
  );

  const raw = stdout.trim();

  if (!raw) {
    throw new Error('Scale returned no data');
  }

  return {
    ok: true,
    scaleId: validated.scaleId,
    raw: raw.slice(0, MAX_SCALE_RAW_BYTES),
  };
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
      scaleTransport: 'windows-system-serial',
    });
  }

  if (req.method === 'GET' && url.pathname === '/v1/printers') {
    return json(res, 200, { printers: await listPrinters() });
  }

  if (req.method === 'GET' && url.pathname === '/v1/scales') {
    return json(res, 200, { scales: await listSerialPorts() });
  }

  if (req.method === 'POST' && url.pathname === '/v1/scales/read') {
    const body = await readJson(req);
    return json(res, 200, await readScale(body));
  }

  if (req.method === 'POST' && url.pathname === '/v1/printers/print') {
    if (process.platform !== 'win32') {
      return json(res, 501, { error: 'Windows RAW printer bridge requires Windows' });
    }

    const body = await readJson(req);

    if (body?.encoding !== 'base64' || typeof body?.data !== 'string') {
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
  Promise.all([
    listPrinters(),
    listSerialPorts(),
  ])
    .then(([printers, scales]) => {
      console.log(JSON.stringify({
        ok: true,
        version: VERSION,
        platform: process.platform,
        printers,
        scales,
      }, null, 2));
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
