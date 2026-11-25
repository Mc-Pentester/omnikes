import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { generateToken } from '@omnikes/lib/crypto';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { POST as creditRefundPost } from '@omnikes/app/api/credits/[id]/refunds/route';

describe('customer credit repayment refunds - PostgreSQL API', () => {
  let organizationId: string;
  let storeId: string;
  let customerId: string;
  let userId: string;
  let roleId: string;
  let saleId: string;
  let creditId: string;
  let paymentId: string;
  let returnId: string;
  let sessionId: string;
  let rawToken: string;

  beforeAll(async () => {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { slug: 'omnikes-test-commerce-a' } });
    organizationId = organization.id;
    await prisma.organization.update({
      where: { id: organizationId },
      data: { subscriptionStatus: 'ACTIVE', subscriptionPlan: 'OMNIKES_249', subscriptionExpiresAt: new Date(Date.now() + 86400000) },
    });
    const store = await prisma.store.findFirstOrThrow({ where: { organizationId, code: 'STORE-A' } });
    storeId = store.id;
    const suffix = Date.now().toString();
    const customer = await prisma.customer.create({
      data: { organizationId, name: 'Credit refund API test', email: `credit-refund-${suffix}@omnikes.test` },
    });
    customerId = customer.id;
    const user = await prisma.user.create({
      data: {
        organizationId,
        email: `credit-refund-user-${suffix}@omnikes.test`,
        name: 'Credit Refund Test User',
        password: await bcrypt.hash('CreditRefund-Test!2026', 10),
        isActive: true,
      },
    });
    userId = user.id;
    const permission = await prisma.permission.findUniqueOrThrow({ where: { code: 'payment.refund' } });
    const role = await prisma.role.create({
      data: {
        organizationId,
        name: `CREDIT-REFUND-TEST-${suffix}`,
        description: 'Temporary PostgreSQL credit refund test role',
        isGlobal: false,
        storeId,
        rolePermissions: { create: { permissionId: permission.id } },
      },
    });
    roleId = role.id;
    await prisma.userRole.create({ data: { userId, roleId } });

    const sale = await prisma.sale.create({
      data: {
        organizationId, storeId, customerId,
        orderNumber: `CREDIT-REFUND-${suffix}`,
        status: 'COMPLETED', subtotal: 200, tax: 0, taxRate: 0, total: 200, discount: 0, applyTax: false,
      },
    });
    saleId = sale.id;
    const credit = await prisma.saleCredit.create({
      data: {
        organizationId, storeId, saleId, customerId, amount: 200,
        status: 'SETTLED', authorizedBy: userId, dueAt: new Date(Date.now() + 86400000),
      },
    });
    creditId = credit.id;
    const payment = await prisma.creditPayment.create({
      data: {
        organizationId, storeId, saleCreditId: creditId, receivedBy: userId,
        amount: 200, method: 'CARD', reference: 'TEST-CARD-200',
        idempotencyKey: `credit-refund-payment-${suffix}`,
      },
    });
    paymentId = payment.id;
    const returnRecord = await prisma.return.create({
      data: { organizationId, storeId, saleId, status: 'COMPLETED', totalRefunded: 200, reason: 'API test', returnedBy: userId },
    });
    returnId = returnRecord.id;

    rawToken = generateToken();
    const session = await sessionRepository.create({
      user: { connect: { id: userId } },
      expiresAt: new Date(Date.now() + 86400000),
      ipAddress: '127.0.0.1',
      userAgent: 'credit-refund-postgres-test',
    }, rawToken);
    sessionId = session.id;
  });

  afterAll(async () => {
    if (sessionId) await prisma.session.deleteMany({ where: { id: sessionId } });
    if (creditId) await prisma.creditRefund.deleteMany({ where: { saleCreditId: creditId } });
    if (returnId) await prisma.return.deleteMany({ where: { id: returnId } });
    if (paymentId) await prisma.creditPayment.deleteMany({ where: { id: paymentId } });
    if (creditId) await prisma.saleCredit.deleteMany({ where: { id: creditId } });
    if (saleId) await prisma.sale.deleteMany({ where: { id: saleId } });
    if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
    if (userId) await prisma.userRole.deleteMany({ where: { userId } });
    if (roleId) {
      await prisma.rolePermission.deleteMany({ where: { roleId } });
      await prisma.role.deleteMany({ where: { id: roleId } });
    }
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('refunds only the returned and collected amount and replays idempotently', async () => {
    const key = 'credit-refund-api-' + Date.now();
    const request = () => new NextRequest(`http://localhost/api/credits/${creditId}/refunds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `auth_token=${rawToken}`, origin: 'http://localhost', 'Idempotency-Key': key },
      body: JSON.stringify({ returnId, paymentId, amount: 100, reference: 'REFUND-CARD-100' }),
    });
    const first = await creditRefundPost(request(), { params: Promise.resolve({ id: creditId }) });
    expect(first.status).toBe(201);
    const firstBody = await first.json();

    const replay = await creditRefundPost(request(), { params: Promise.resolve({ id: creditId }) });
    expect(replay.status).toBe(201);
    expect((await replay.json()).id).toBe(firstBody.id);
    expect(await prisma.creditRefund.count({ where: { returnId } })).toBe(1);

    const excessive = await creditRefundPost(new NextRequest(`http://localhost/api/credits/${creditId}/refunds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `auth_token=${rawToken}`, origin: 'http://localhost', 'Idempotency-Key': 'credit-refund-too-much-' + Date.now() },
      body: JSON.stringify({ returnId, paymentId, amount: 101 }),
    }), { params: Promise.resolve({ id: creditId }) });
    expect(excessive.status).toBe(409);
    expect(Number((await prisma.creditPayment.findUniqueOrThrow({ where: { id: paymentId } })).refundedAmount)).toBe(100);
  });
});
