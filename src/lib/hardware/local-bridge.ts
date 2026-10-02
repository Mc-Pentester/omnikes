export interface LocalHardwareBridgeOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export interface HardwareBridgeHealth {
  ok: boolean;
  version?: string;
}

export interface EscPosPrintRequest {
  data: string;
  encoding: 'base64';
  printerId?: string;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:8765';
const DEFAULT_TIMEOUT_MS = 5000;

function assertLoopbackUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]' && host !== '::1') {
    throw new Error('Hardware bridge must use a loopback address');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Hardware bridge must use HTTP or HTTPS');
  }
  return url;
}

function normalizeBaseUrl(value: string): string {
  return assertLoopbackUrl(value).toString().replace(/\/$/, '');
}

function toBase64(data: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    binary += String.fromCharCode(...data.subarray(offset, Math.min(offset + chunkSize, data.length)));
  }
  return btoa(binary);
}

export class LocalHardwareBridgeClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: LocalHardwareBridgeOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.timeoutMs = Math.max(1000, Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 30000));
  }

  async health(): Promise<HardwareBridgeHealth> {
    return this.request<HardwareBridgeHealth>('/health', { method: 'GET' });
  }

  async printEscPos(data: Uint8Array, printerId?: string): Promise<void> {
    const body: EscPosPrintRequest = {
      data: toBase64(data),
      encoding: 'base64',
      ...(printerId ? { printerId } : {}),
    };
    await this.request('/v1/printers/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Hardware bridge request failed (${response.status})`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

export function createLocalHardwareBridge(options: LocalHardwareBridgeOptions = {}) {
  return new LocalHardwareBridgeClient(options);
}
