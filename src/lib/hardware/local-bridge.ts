import type { ScaleSerialOptions } from './scale';

export interface LocalHardwareBridgeOptions {
  baseUrl?: string;
  timeoutMs?: number;
  token: string;
}

export interface HardwareBridgeHealth {
  ok: boolean;
  version?: string;
  platform?: string;
  transport?: string;
}

export interface EscPosPrintRequest {
  data: string;
  encoding: 'base64';
  printerId?: string;
}

export interface ScaleBridgeReadResponse {
  ok: boolean;
  scaleId: string;
  raw: string;
}

export interface ScalePortInfo {
  DeviceID?: string;
  Name?: string;
  Description?: string;
  Manufacturer?: string;
  Status?: string;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:8765';
const DEFAULT_TIMEOUT_MS = 5000;
const MIN_TOKEN_LENGTH = 32;

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
    binary += String.fromCharCode(
      ...data.subarray(offset, Math.min(offset + chunkSize, data.length)),
    );
  }
  return btoa(binary);
}

export class HardwareBridgeRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Hardware bridge request failed (${status})`);
    this.name = 'HardwareBridgeRequestError';
    this.status = status;
  }
}

export class LocalHardwareBridgeClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly token: string;

  constructor(options: LocalHardwareBridgeOptions) {
    if (options.token.length < MIN_TOKEN_LENGTH) {
      throw new Error('Hardware bridge token must be at least 32 characters');
    }

    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.timeoutMs = Math.max(
      1000,
      Math.min(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 30000),
    );
    this.token = options.token;
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

  async listScales(): Promise<{ scales: ScalePortInfo[] }> {
    return this.request<{ scales: ScalePortInfo[] }>('/v1/scales', {
      method: 'GET',
    });
  }

  async readScale(options: ScaleSerialOptions): Promise<ScaleBridgeReadResponse> {
    return this.request<ScaleBridgeReadResponse>('/v1/scales/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.token}`);

    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      headers,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new HardwareBridgeRequestError(response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

export function createLocalHardwareBridge(options: LocalHardwareBridgeOptions) {
  return new LocalHardwareBridgeClient(options);
}
