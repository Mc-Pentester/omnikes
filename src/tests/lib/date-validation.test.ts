import { describe, expect, it } from 'vitest';
import { parseReportDateParam } from '@omnikes/lib/date-validation';

describe('parseReportDateParam', () => {
  it('keeps a start date at the beginning of the requested calendar day', () => {
    expect(parseReportDateParam('2026-10-03')?.toISOString()).toBe('2026-10-03T00:00:00.000Z');
  });

  it('makes a date-only report end date inclusive through 23:59:59.999 UTC', () => {
    expect(parseReportDateParam('2026-10-03', true)?.toISOString()).toBe('2026-10-03T23:59:59.999Z');
  });

  it('preserves an explicit timestamp instead of changing it to end-of-day', () => {
    expect(parseReportDateParam('2026-10-03T12:30:00.000Z', true)?.toISOString()).toBe('2026-10-03T12:30:00.000Z');
  });
});
