import { describe, expect, it, afterAll } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { cashService } from '@omnikes/services/cash.service';

const ids = {
  org: `ccashorg${Date.now().toString().slice(-10)}`,
  store: `ccashstore${Date.now().toString().slice(-10)}`,
  user: `ccashuser${Date.now().toString().slice(-10)}`,
};

describe('cash management PostgreSQL runtime proof', () => {
  afterAll(async () => {
    await prisma.cashMovement.deleteMany({ where: { organizationId: ids.org } });
    await prisma.cashSession.deleteMany({ where: { organizationId: ids.org } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.store.deleteMany({ where: { id: ids.store } });
    await prisma.organization.deleteMany({ where: { id: ids.org } });
    await prisma.$disconnect();
  });

  it('opens, tracks, reconciles and closes a cash session', async () => {
    await prisma.organization.create({ data: { id: ids.org, name: 'Cash Runtime Org', slug: `cash-runtime-${Date.now()}`, country: 'HT', currency: 'HTG' } });
    await prisma.store.create({ data: { id: ids.store, organizationId: ids.org, name: 'Cash Runtime Store', code: `CASH-${Date.now()}` } });
    await prisma.user.create({ data: { id: ids.user, organizationId: ids.org, email: `cash-${Date.now()}@example.test`, password: 'runtime-test-password' } });

    const opened = await cashService.open(ids.org, ids.user, { storeId: ids.store, openingAmount: 5000 });
    expect(opened.status).toBe('OPEN');

    await cashService.addMovement(ids.org, ids.store, opened.id, ids.user, { type: 'CASH_IN', amount: 500 });
    await prisma.cashMovement.create({
      data: {
        organizationId: ids.org,
        storeId: ids.store,
        cashSessionId: opened.id,
        createdBy: ids.user,
        type: 'SALE_CASH',
        amount: 2000,
        referenceType: 'RUNTIME_TEST',
      },
    });
    await cashService.addMovement(ids.org, ids.store, opened.id, ids.user, { type: 'CASH_OUT', amount: 250 });

    const summary = await cashService.summary(ids.org, opened.id);
    expect(summary.expectedAmount).toBe(7250);

    const closed = await cashService.close(ids.org, opened.id, ids.user, { countedAmount: 7200 });
    expect(closed.status).toBe('CLOSED');
    expect(Number(closed.expectedAmount)).toBe(7250);
    expect(Number(closed.difference)).toBe(-50);
  });
});
