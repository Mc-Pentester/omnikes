/**
 * Normalize a contact number for WhatsApp provider APIs.
 *
 * Local Haitian 8-digit numbers are normalized to country code 509.
 * International numbers must include their country code (with or without a
 * leading plus). This function does not verify that a number has WhatsApp.
 */
export function normalizeWhatsAppPhone(input: string): string {
  const value = input.trim();
  if (!value) {
    throw new Error('Phone number is required');
  }

  const hasLeadingPlus = value.startsWith('+');
  const digits = value.replace(/[\s().-]/g, '').replace(/^\+/, '');

  if (!/^\d+$/.test(digits)) {
    throw new Error('Phone number contains unsupported characters');
  }

  const e164Digits = !hasLeadingPlus && digits.length === 8
    ? `509${digits}`
    : digits;

  // E.164 allows at most 15 digits; country calling codes cannot start with 0.
  if (e164Digits.length < 8 || e164Digits.length > 15 || e164Digits.startsWith('0')) {
    throw new Error('Phone number must be a valid international number');
  }

  return `+${e164Digits}`;
}
