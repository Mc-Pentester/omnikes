export type ScaleUnit = 'g' | 'kg' | 'lb' | 'oz';

export interface ScaleReading {
  weight: number;
  unit: ScaleUnit;
  weightGrams: number;
  stable: boolean;
  raw: string;
  timestamp: number;
}

export interface ScaleSerialOptions {
  scaleId: string;
  baudRate?: number;
  dataBits?: 7 | 8;
  parity?: 'none' | 'odd' | 'even' | 'mark' | 'space';
  stopBits?: 1 | 1.5 | 2;
  command?: string;
  readTimeoutMs?: number;
  settleMs?: number;
}

export interface ScaleAdapter {
  readonly type: 'scale';
  read(): Promise<ScaleReading>;
  health?(): Promise<boolean>;
}

const UNIT_TO_GRAMS: Record<ScaleUnit, number> = {
  g: 1,
  kg: 1000,
  lb: 453.59237,
  oz: 28.349523125,
};

function normalizeUnit(value: string): ScaleUnit | null {
  switch (value.trim().toLowerCase()) {
    case 'g':
    case 'gram':
    case 'grams':
      return 'g';
    case 'kg':
    case 'kgs':
    case 'kilogram':
    case 'kilograms':
      return 'kg';
    case 'lb':
    case 'lbs':
    case 'pound':
    case 'pounds':
      return 'lb';
    case 'oz':
    case 'ounce':
    case 'ounces':
      return 'oz';
    default:
      return null;
  }
}

function parseNumber(value: string): number | null {
  const match = value.trim().replace(',', '.').match(/[+-]?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseScaleReading(rawInput: string): ScaleReading {
  const raw = rawInput.trim();
  if (!raw) throw new Error('Scale returned an empty reading');

  const upper = raw.toUpperCase();
  const stable =
    /\bST\b/.test(upper) ||
    /\bSTABLE\b/.test(upper) ||
    /^\s*ST[,;:]/i.test(raw);

  const unitMatches = [...raw.matchAll(/\b(kg|kgs|g|grams?|lb|lbs|oz|ounces?)\b/gi)];
  const unitToken = unitMatches.at(-1)?.[1];
  const unit = unitToken ? normalizeUnit(unitToken) : null;

  if (!unit) throw new Error(`Unsupported scale unit in reading: ${raw}`);

  const numericSource = unitToken
    ? raw.slice(0, unitMatches.at(-1)!.index ?? raw.length)
    : raw;

  const weight = parseNumber(numericSource);
  if (weight === null) throw new Error(`Invalid scale weight: ${raw}`);
  if (weight < 0) throw new Error(`Negative scale weight is not accepted: ${raw}`);

  return {
    weight,
    unit,
    weightGrams: weight * UNIT_TO_GRAMS[unit],
    stable,
    raw,
    timestamp: Date.now(),
  };
}
