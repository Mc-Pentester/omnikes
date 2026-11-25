import { LocalHardwareBridgeClient, type LocalHardwareBridgeOptions } from './local-bridge';
import { parseScaleReading, type ScaleAdapter, type ScaleReading, type ScaleSerialOptions } from './scale';

export class LocalBridgeScaleAdapter implements ScaleAdapter {
  readonly type = 'scale' as const;

  constructor(
    private readonly bridge: LocalHardwareBridgeClient,
    private readonly options: ScaleSerialOptions,
  ) {}

  async health(): Promise<boolean> {
    try {
      return (await this.bridge.health()).ok === true;
    } catch {
      return false;
    }
  }

  async read(): Promise<ScaleReading> {
    const response = await this.bridge.readScale(this.options);
    if (!response.ok) throw new Error('Scale bridge returned an unsuccessful response');
    return parseScaleReading(response.raw);
  }
}

export function createLocalBridgeScale(
  options: ScaleSerialOptions,
  bridgeOptions: LocalHardwareBridgeOptions,
): LocalBridgeScaleAdapter {
  return new LocalBridgeScaleAdapter(
    new LocalHardwareBridgeClient(bridgeOptions),
    options,
  );
}
