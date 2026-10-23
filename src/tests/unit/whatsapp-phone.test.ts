import { describe, expect, it } from 'vitest';
import { normalizeWhatsAppPhone } from '../../lib/whatsapp/phone';

describe('normalizeWhatsAppPhone', () => {
  it('adds Haiti country code to a local eight-digit number', () => {
    expect(normalizeWhatsAppPhone('3655-1234')).toBe('+50936551234');
  });

  it('normalizes an international number with formatting', () => {
    expect(normalizeWhatsAppPhone('+1 (202) 555-0123')).toBe('+12025550123');
  });

  it('accepts an international number without a plus sign', () => {
    expect(normalizeWhatsAppPhone('50936551234')).toBe('+50936551234');
  });

  it.each(['', '   ', '123', '01234567', '12abc345', '+1234567890123456'])(
    'rejects invalid input: %s',
    (input) => {
      expect(() => normalizeWhatsAppPhone(input)).toThrow();
    },
  );
});
