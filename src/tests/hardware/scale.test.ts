import { describe, expect, it } from 'vitest';
import { parseScaleReading } from '../../lib/hardware/scale';

describe('parseScaleReading', () => {
  it('parses kilograms', () => {
    const reading = parseScaleReading('+001.250 kg');
    expect(reading.weight).toBe(1.25);
    expect(reading.unit).toBe('kg');
    expect(reading.weightGrams).toBe(1250);
    expect(reading.stable).toBe(false);
  });

  it('parses stable scale protocol', () => {
    const reading = parseScaleReading('ST,GS,+001.250kg');
    expect(reading.weight).toBe(1.25);
    expect(reading.unit).toBe('kg');
    expect(reading.weightGrams).toBe(1250);
    expect(reading.stable).toBe(true);
  });

  it('parses grams', () => {
    const reading = parseScaleReading('1250 g');
    expect(reading.weightGrams).toBe(1250);
    expect(reading.unit).toBe('g');
  });

  it('parses pounds', () => {
    const reading = parseScaleReading('2 lb');
    expect(reading.weightGrams).toBeCloseTo(907.18474, 5);
  });

  it('parses ounces', () => {
    const reading = parseScaleReading('16 oz');
    expect(reading.weightGrams).toBeCloseTo(453.59237, 5);
  });

  it('rejects empty values', () => {
    expect(() => parseScaleReading('')).toThrow();
  });

  it('rejects unsupported units', () => {
    expect(() => parseScaleReading('1.25 ton')).toThrow();
  });

  it('rejects negative weight', () => {
    expect(() => parseScaleReading('-1.25 kg')).toThrow();
  });

  it('preserves raw input', () => {
    const reading = parseScaleReading('WT: 1.250 kg');
    expect(reading.raw).toBe('WT: 1.250 kg');
  });
});
