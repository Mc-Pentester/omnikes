import type { EscPosTransport } from './escpos';
import { LocalHardwareBridgeClient, type LocalHardwareBridgeOptions } from './local-bridge';

export class LocalBridgeEscPosTransport implements EscPosTransport {
  private connected = false;

  constructor(
    private readonly bridge: LocalHardwareBridgeClient,
    private readonly printerId: string,
  ) {}

  async connect(): Promise<void> {
    await this.bridge.health();
    this.connected = true;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.connected) throw new Error('ESC/POS transport is not connected');
    await this.bridge.printEscPos(data, this.printerId);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }
}

export function createLocalBridgeEscPosTransport(
  options: LocalHardwareBridgeOptions,
  printerId: string,
) {
  return new LocalBridgeEscPosTransport(new LocalHardwareBridgeClient(options), printerId);
}
