import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '@omnikes/lib/prisma';
import { registrationService } from '@omnikes/services/registration.service';
import { stopRateLimitCleanup } from '@omnikes/lib/rate-limiter';

const expectedTaxEnabled = process.env.REGISTRATION_EXPECTED_TAX_ENABLED === 'true';
const expectedTaxRate = Number(process.env.REGISTRATION_EXPECTED_TAX_RATE ?? '0');

describe('first organization registration persists fiscal settings in PostgreSQL', () => {
  afterAll(async () => {
    stopRateLimitCleanup();
    await prisma.$disconnect();
  });

  it('persists the requested tax flag and percentage on the organization created by the real registration service', async () => {
    expect(process.env.REGISTRATION_EXPECTED_TAX_ENABLED).toMatch(/^(true|false)$/);
    expect(Number.isFinite(expectedTaxRate)).toBe(true);

    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const organizationName = `Fiscal Registration ${suffix}`;
    const email = `fiscal-registration-${suffix}@omnikes.test`;

    const result = await registrationService.register({
      organizationName,
      name: 'Fiscal Registration Admin',
      email,
      password: 'Registration-Test-Password-2026!',
      country: 'HT',
      currency: 'HTG',
      currencySymbol: 'G',
      locale: 'fr-HT',
      timezone: 'America/Port-au-Prince',
      taxEnabled: expectedTaxEnabled,
      taxRate: expectedTaxRate,
    });

    expect(result.pendingApproval).toBe(false);
    expect(result.token).toBeTruthy();

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: result.user.organizationId },
      select: { id: true, name: true, taxEnabled: true, taxRate: true },
    });
    expect(organization.name).toBe(organizationName);
    expect(organization.taxEnabled).toBe(expectedTaxEnabled);
    expect(Number(organization.taxRate)).toBeCloseTo(expectedTaxRate / 100, 4);

    const administrator = await prisma.user.findUniqueOrThrow({
      where: { id: result.user.id },
      select: {
        isActive: true,
        organizationId: true,
        userRoles: { select: { role: { select: { name: true } } } },
      },
    });
    expect(administrator.isActive).toBe(true);
    expect(administrator.organizationId).toBe(organization.id);
    expect(administrator.userRoles.some(({ role }) => role.name === 'ADMIN')).toBe(true);
  });
});
