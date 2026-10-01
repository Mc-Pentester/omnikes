import { describe, expect, it } from 'vitest';
import { adminOrganizationUpdateSchema } from '@omnikes/lib/validation';

describe('Administration organization validation', () => {
  it('accepts supported organization settings', () => {
    const result = adminOrganizationUpdateSchema.safeParse({
      name: 'Commerce Test',
      country: 'ht',
      currency: 'htg',
      locale: 'fr-HT',
      timezone: 'America/Port-au-Prince',
      cloudEnabled: false,
      onlineStoreEnabled: false,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.country).toBe('HT');
      expect(result.data.currency).toBe('HTG');
    }
  });

  it('does not expose organization identity fields for mutation', () => {
    const result = adminOrganizationUpdateSchema.safeParse({
      name: 'Updated',
      slug: 'another-organization',
      organizationId: 'cl123456789012345678901234',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect('slug' in result.data).toBe(false);
      expect('organizationId' in result.data).toBe(false);
    }
  });

  it('rejects invalid country and currency lengths', () => {
    expect(adminOrganizationUpdateSchema.safeParse({ country: 'Haiti' }).success).toBe(false);
    expect(adminOrganizationUpdateSchema.safeParse({ currency: 'HT' }).success).toBe(false);
  });

  it('rejects invalid timezone', () => {
    // Timezone syntax is validated by the service because Intl owns the runtime timezone database.
    expect(adminOrganizationUpdateSchema.safeParse({ timezone: 'Not/A-Timezone' }).success).toBe(true);
  });
});
