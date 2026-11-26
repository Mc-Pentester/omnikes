import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { generateToken } from '@omnikes/lib/crypto';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { prisma } from '@omnikes/lib/prisma';
import { saleService } from '@omnikes/services/sale.service';
import { roleRepository } from '@omnikes/repositories/role.repository';

import { POST as creditPost } from '@omnikes/app/api/sales/[id]/credit/route';
import { POST as creditPaymentPost } from '@omnikes/app/api/credits/[id]/payments/route';

describe('P0-24-F.2-D.1 - real PostgreSQL credit API cross-store proof', () => {
  let orgA: { id: string } | undefined;
  let storeA: { id: string } | undefined;
  let storeB: { id: string } | undefined;
  let customerA: { id: string } | undefined;
  let temporaryCustomerA = false;
  let scopedUser: { id: string; email: string } | undefined;
  let managerUser: { id: string; email: string } | undefined;
  let scopedRole: { id: string } | undefined;
  let managerRole: { id: string } | undefined;
  let permission: { id: string } | undefined;
  let approvalPermission: { id: string } | undefined;
  let repaymentPermission: { id: string } | undefined;
  const managerPassword = 'P0F2D-Manager-Approval!2026';
  let sameStoreSaleId: string;
  let crossStoreSaleId: string;
  let pinSaleId: string;
  const managerTestPin = ['7', '3', '9', '1', '8', '4'].join('');

  beforeAll(async () => {
    orgA = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'omnikes-test-commerce-a' },
      select: { id: true },
    });

    // This API proof exercises a Professional capability and must run against
    // an explicitly entitled test organization, not the unconfigured seed default.
    await prisma.organization.update({
      where: { id: orgA!.id },
      data: {
        subscriptionStatus: 'ACTIVE',
        subscriptionPlan: 'OMNIKES_249',
        subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    storeA = await prisma.store.findFirstOrThrow({
      where: { organizationId: orgA!.id, code: 'STORE-A' },
      select: { id: true },
    });

    const existingStoreB = await prisma.store.findFirst({
      where: { organizationId: orgA!.id, code: 'P0-F2-D-STORE-B' },
      select: { id: true },
    });

    storeB = existingStoreB ?? await prisma.store.create({
      data: {
        organizationId: orgA!.id,
        name: 'P0-24-F.2-D Store B',
        code: 'P0-F2-D-STORE-B',
        country: 'HT',
        isActive: true,
      },
      select: { id: true },
    });

    const suffix = Date.now().toString();

    customerA = await prisma.customer.create({
      data: {
        organizationId: orgA!.id,
        name: 'P0-24-F.2-D API Customer A',
        email: `p0-24-f2-d-api-customer-${suffix}@omnikes.test`,
      },
      select: { id: true },
    });
    temporaryCustomerA = true;

    permission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'credit.request' },
      select: { id: true },
    });
    approvalPermission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'credit.approve' },
      select: { id: true },
    });
    repaymentPermission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'credit.payment.receive' },
      select: { id: true },
    });

    scopedUser = await prisma.user.create({
      data: {
        organizationId: orgA!.id,
        email: `p0-24-f2-d-api-${suffix}@omnikes.test`,
        name: 'P0-24-F.2-D API Scoped User',
        password: await bcrypt.hash('P0F2D-Api-Test!2026', 10),
        isActive: true,
      },
      select: { id: true, email: true },
    });

    scopedRole = await prisma.role.create({
      data: {
        organizationId: orgA!.id,
        name: `P0-F2-D-STORE-A-${suffix}`,
        description: 'P0-24-F.2-D temporary scoped API proof role',
        isGlobal: false,
        storeId: storeA!.id,
        rolePermissions: {
          create: {
            permissionId: permission!.id,
          },
        },
      },
      select: { id: true },
    });

    await prisma.userRole.create({
      data: {
        userId: scopedUser!.id,
        roleId: scopedRole!.id,
      },
    });
    await prisma.rolePermission.create({
      data: { roleId: scopedRole!.id, permissionId: repaymentPermission!.id },
    });

    managerUser = await prisma.user.create({
      data: {
        organizationId: orgA!.id,
        email: `p0-24-f2-d-manager-${suffix}@omnikes.test`,
        name: 'P0-24-F.2-D Credit Manager',
        password: await bcrypt.hash(managerPassword, 10),
        isActive: true,
      },
      select: { id: true, email: true },
    });

    managerRole = await prisma.role.create({
      data: {
        organizationId: orgA!.id,
        name: `P0-F2-D-MANAGER-${suffix}`,
        description: 'Temporary credit approval role',
        isGlobal: false,
        storeId: storeA!.id,
        rolePermissions: { create: { permissionId: approvalPermission!.id } },
      },
      select: { id: true },
    });
    await prisma.userRole.create({ data: { userId: managerUser.id, roleId: managerRole.id } });
    await prisma.user.update({
      where: { id: managerUser.id },
      data: { creditPinHash: await bcrypt.hash(managerTestPin, 12) },
    });

    const sameStoreSale = await prisma.sale.create({
      data: {
        organizationId: orgA!.id,
        storeId: storeA!.id,
        orderNumber: `P0-24-F2-D-API-A-${suffix}`,
        customerId: customerA!.id,
        status: 'PENDING',
        subtotal: 1000,
        tax: 0,
        taxRate: 0,
        total: 1000,
        discount: 0,
        applyTax: false,
      },
      select: { id: true, customerId: true, status: true },
    });
    if (sameStoreSale.customerId !== customerA!.id || sameStoreSale.status !== 'PENDING') {
      throw new Error('Credit API fixture failed to persist the expected customer on the authorized-store sale');
    }
    sameStoreSaleId = sameStoreSale.id;

    const pinSale = await prisma.sale.create({
      data: {
        organizationId: orgA!.id,
        storeId: storeA!.id,
        orderNumber: `P0-24-F2-D-API-PIN-${suffix}`,
        customerId: customerA!.id,
        status: 'PENDING',
        subtotal: 200,
        tax: 0,
        taxRate: 0,
        total: 200,
        discount: 0,
        applyTax: false,
      },
      select: { id: true },
    });
    pinSaleId = pinSale.id;

    const crossStoreSale = await prisma.sale.create({
      data: {
        organizationId: orgA!.id,
        storeId: storeB!.id,
        orderNumber: `P0-24-F2-D-API-B-${suffix}`,
        customerId: customerA!.id,
        status: 'PENDING',
        subtotal: 1000,
        tax: 0,
        taxRate: 0,
        total: 1000,
        discount: 0,
        applyTax: false,
      },
      select: { id: true, customerId: true, status: true },
    });
    if (crossStoreSale.customerId !== customerA!.id || crossStoreSale.status !== 'PENDING') {
      throw new Error('Credit API fixture failed to persist the expected customer on the cross-store sale');
    }
    crossStoreSaleId = crossStoreSale.id;
  });

  async function createAuthenticatedCookie() {
    const rawToken = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await sessionRepository.create(
      {
        user: {
          connect: { id: scopedUser!.id },
        },
        expiresAt,
        ipAddress: '127.0.0.1',
        userAgent: 'P0-24-F.2-D-api-runtime-test',
      },
      rawToken,
    );

    return `auth_token=${rawToken}`;
  }

  afterAll(async () => {
    if (scopedUser?.id) await prisma.session.deleteMany({ where: { userId: scopedUser!.id } });
    if (managerUser?.id) await prisma.session.deleteMany({ where: { userId: managerUser!.id } });
    if (sameStoreSaleId || crossStoreSaleId || pinSaleId) {
      const saleIds = [sameStoreSaleId, crossStoreSaleId, pinSaleId].filter(Boolean);
      const creditIds = (await prisma.saleCredit.findMany({ where: { saleId: { in: saleIds } }, select: { id: true } })).map((item) => item.id);
      await prisma.creditPayment.deleteMany({ where: { saleCreditId: { in: creditIds } } });
      await prisma.saleCredit.deleteMany({ where: { saleId: { in: saleIds } } });
      await prisma.sale.deleteMany({
        where: { id: { in: [sameStoreSaleId, crossStoreSaleId, pinSaleId].filter(Boolean) } },
      });
    }
    if (scopedUser?.id) {
      await prisma.userRole.deleteMany({ where: { userId: scopedUser!.id } });
    }
    if (scopedRole?.id) {
      await prisma.rolePermission.deleteMany({ where: { roleId: scopedRole!.id } });
      await prisma.role.delete({ where: { id: scopedRole!.id } }).catch(() => undefined);
    }
    if (managerRole?.id) {
      await prisma.rolePermission.deleteMany({ where: { roleId: managerRole!.id } });
      await prisma.userRole.deleteMany({ where: { roleId: managerRole!.id } });
      await prisma.role.delete({ where: { id: managerRole!.id } }).catch(() => undefined);
    }
    if (managerUser?.id) await prisma.user.delete({ where: { id: managerUser!.id } }).catch(() => undefined);
    if (scopedUser?.id) {
      await prisma.user.delete({ where: { id: scopedUser!.id } }).catch(() => undefined);
    }

    if (storeB?.id) {
      const temporaryStore = await prisma.store.findUnique({
        where: { id: storeB!.id },
        select: { code: true },
      });
      if (temporaryStore?.code === 'P0-F2-D-STORE-B') {
        await prisma.store.delete({ where: { id: storeB!.id } }).catch(() => undefined);
      }
    }
    if (temporaryCustomerA && customerA?.id) {
      await prisma.customer.delete({ where: { id: customerA!.id } }).catch(() => undefined);
    }

    await prisma.$disconnect();
  });

  it('provisions the seeded ADMIN with credit management and keeps CASHIER approval restricted', async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin.a@omnikes.test' }, select: { id: true },
    });
    const cashier = await prisma.user.findUniqueOrThrow({
      where: { email: 'cashier.a@omnikes.test' }, select: { id: true },
    });

    expect(await roleRepository.hasPermission(admin.id, 'credit.approve')).toBe(true);
    expect(await roleRepository.hasPermission(admin.id, 'credit.view')).toBe(true);
    expect(await roleRepository.hasPermission(admin.id, 'credit.settings.manage')).toBe(true);
    expect(await roleRepository.hasPermission(cashier.id, 'credit.request')).toBe(true);
    expect(await roleRepository.hasPermission(cashier.id, 'credit.approve')).toBe(false);
    expect(await roleRepository.hasPermission(cashier.id, 'credit.settings.manage')).toBe(false);
  });

  it('allows the scoped user to authorize credit on the authorized store through the real API route', async () => {
    const cookie = await createAuthenticatedCookie();

    const request = new NextRequest(
      `http://localhost/api/sales/${sameStoreSaleId}/credit`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie,
          origin: 'http://localhost',
        },
        body: JSON.stringify({
          customerId: customerA!.id,
          amount: 1000,
          approverEmail: managerUser!.email,
          approverPassword: managerPassword,
        }),
      },
    );

    const response = await creditPost(request, {
      params: Promise.resolve({ id: sameStoreSaleId }),
    });

    const responseBody = await response.json();
    expect(response.status, JSON.stringify(responseBody)).toBe(201);

    const credit = await prisma.saleCredit.findUnique({
      where: { saleId: sameStoreSaleId },
    });
    expect(credit).not.toBeNull();
    expect(Number(credit?.amount)).toBe(1000);
  });

  it('rejects manager credentials that do not match the second authorized user', async () => {
    const before = await prisma.saleCredit.count({ where: { saleId: sameStoreSaleId } });
    const request = new NextRequest(`http://localhost/api/sales/${sameStoreSaleId}/credit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await createAuthenticatedCookie(), origin: 'http://localhost' },
      body: JSON.stringify({
        customerId: customerA!.id,
        amount: 1000,
        approverEmail: managerUser!.email,
        approverPassword: 'incorrect-manager-password',
      }),
    });
    const response = await creditPost(request, { params: Promise.resolve({ id: sameStoreSaleId }) });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('Invalid manager approval credentials');
    expect(await prisma.saleCredit.count({ where: { saleId: sameStoreSaleId } })).toBe(before);
  });

  it('checks approver permission before credentials and never increments an unauthorized approver lockout', async () => {
    await prisma.rolePermission.deleteMany({
      where: { roleId: managerRole!.id, permissionId: approvalPermission!.id },
    });
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: managerUser!.id },
      select: { creditApprovalFailedAttempts: true, creditApprovalLockedUntil: true },
    });
    const request = new NextRequest(`http://localhost/api/sales/${sameStoreSaleId}/credit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await createAuthenticatedCookie(), origin: 'http://localhost' },
      body: JSON.stringify({
        customerId: customerA!.id,
        amount: 1000,
        approverEmail: managerUser!.email,
        approverPassword: 'wrong-password-must-not-be-checked',
      }),
    });
    const response = await creditPost(request, { params: Promise.resolve({ id: sameStoreSaleId }) });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('Approver is not authorized to approve customer credit');
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: managerUser!.id },
      select: { creditApprovalFailedAttempts: true, creditApprovalLockedUntil: true },
    });
    expect(after).toEqual(before);
    await prisma.rolePermission.create({
      data: { roleId: managerRole!.id, permissionId: approvalPermission!.id },
    });
  });

  it('rejects self-approval even when the requester supplies their own valid password', async () => {
    const before = await prisma.saleCredit.count({ where: { saleId: sameStoreSaleId } });
    const request = new NextRequest(`http://localhost/api/sales/${sameStoreSaleId}/credit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await createAuthenticatedCookie(), origin: 'http://localhost' },
      body: JSON.stringify({
        customerId: customerA!.id,
        amount: 1000,
        approverEmail: scopedUser!.email,
        approverPassword: 'P0F2D-Api-Test!2026',
      }),
    });
    const response = await creditPost(request, { params: Promise.resolve({ id: sameStoreSaleId }) });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('Invalid manager approval credentials');
    expect(await prisma.saleCredit.count({ where: { saleId: sameStoreSaleId } })).toBe(before);
  });

  it('supports manager PIN approval and requires a reason when the customer limit is exceeded', async () => {
    await prisma.customer.update({ where: { id: customerA!.id }, data: { creditLimit: 100 } });
    const request = new NextRequest(`http://localhost/api/sales/${pinSaleId}/credit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await createAuthenticatedCookie(), origin: 'http://localhost' },
      body: JSON.stringify({
        customerId: customerA!.id,
        amount: 200,
        approverEmail: managerUser!.email,
        approverPin: managerTestPin,
      }),
    });
    const response = await creditPost(request, { params: Promise.resolve({ id: pinSaleId }) });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('Customer credit limit exceeded');
    expect(await prisma.saleCredit.count({ where: { saleId: pinSaleId } })).toBe(0);

    const overrideRequest = new NextRequest(`http://localhost/api/sales/${pinSaleId}/credit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await createAuthenticatedCookie(), origin: 'http://localhost' },
      body: JSON.stringify({
        customerId: customerA!.id,
        amount: 200,
        note: 'Test de dépassement de plafond autorisé',
        approverEmail: managerUser!.email,
        approverPin: managerTestPin,
      }),
    });
    const overrideResponse = await creditPost(overrideRequest, { params: Promise.resolve({ id: pinSaleId }) });
    expect(overrideResponse.status).toBe(201);
    const credit = await prisma.saleCredit.findUnique({ where: { saleId: pinSaleId } });
    expect(credit?.dueAt).toBeInstanceOf(Date);
    expect(credit?.authorizedBy).toBe(managerUser!.id);
    expect(credit?.status).toBe('APPROVED_PENDING_COMPLETION');
    expect(credit?.expiresAt).toBeInstanceOf(Date);
    expect(credit!.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    await prisma.saleCredit.update({
      where: { id: credit!.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(saleService.complete(pinSaleId, orgA!.id))
      .rejects.toThrow('Credit approval has expired; request a new approval');

    const renewedApproval = new NextRequest(`http://localhost/api/sales/${pinSaleId}/credit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await createAuthenticatedCookie(), origin: 'http://localhost' },
      body: JSON.stringify({
        customerId: customerA!.id,
        amount: 200,
        note: 'Test de dépassement de plafond autorisé',
        approverEmail: managerUser!.email,
        approverPin: managerTestPin,
      }),
    });
    const renewedResponse = await creditPost(renewedApproval, { params: Promise.resolve({ id: pinSaleId }) });
    expect(renewedResponse.status).toBe(201);
    const renewedCredit = await prisma.saleCredit.findUniqueOrThrow({ where: { saleId: pinSaleId } });
    expect(renewedCredit.expiresAt!.getTime()).toBeGreaterThan(Date.now());

    await saleService.complete(pinSaleId, orgA!.id);
    const finalizedCredit = await prisma.saleCredit.findUniqueOrThrow({ where: { saleId: pinSaleId } });
    expect(finalizedCredit.status).toBe('AUTHORIZED');
  });

  it('records partial and final customer credit repayments', async () => {
    const credit = await prisma.saleCredit.findUniqueOrThrow({ where: { saleId: pinSaleId } });
    const firstKey = 'credit-payment-part-1-' + Date.now();
    const firstRequest = new NextRequest(`http://localhost/api/credits/${credit.id}/payments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await createAuthenticatedCookie(), origin: 'http://localhost', 'Idempotency-Key': firstKey },
      body: JSON.stringify({ amount: 50, method: 'CARD', reference: 'CARD-REF-1' }),
    });
    const firstResponse = await creditPaymentPost(firstRequest, { params: Promise.resolve({ id: credit.id }) });
    expect(firstResponse.status).toBe(201);
    const firstBody = await firstResponse.json();
    expect(firstBody.outstandingAfter).toBe(150);

    const replayRequest = new NextRequest(`http://localhost/api/credits/${credit.id}/payments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await createAuthenticatedCookie(), origin: 'http://localhost', 'Idempotency-Key': firstKey },
      body: JSON.stringify({ amount: 50, method: 'CARD', reference: 'CARD-REF-1' }),
    });
    const replayResponse = await creditPaymentPost(replayRequest, { params: Promise.resolve({ id: credit.id }) });
    expect(replayResponse.status).toBe(200);
    expect((await replayResponse.json()).id).toBe(firstBody.id);
    expect(await prisma.creditPayment.count({ where: { saleCreditId: credit.id } })).toBe(1);

    const secondRequest = new NextRequest(`http://localhost/api/credits/${credit.id}/payments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: await createAuthenticatedCookie(), origin: 'http://localhost', 'Idempotency-Key': 'credit-payment-part-2-' + Date.now() },
      body: JSON.stringify({ amount: 150, method: 'CARD', reference: 'CARD-REF-2' }),
    });
    const secondResponse = await creditPaymentPost(secondRequest, { params: Promise.resolve({ id: credit.id }) });
    expect(secondResponse.status).toBe(201);
    expect((await secondResponse.json()).outstandingAfter).toBe(0);
    const updatedCredit = await prisma.saleCredit.findUniqueOrThrow({ where: { id: credit.id } });
    expect(updatedCredit.status).toBe('SETTLED');
    expect(await prisma.creditPayment.count({ where: { saleCreditId: credit.id } })).toBe(2);
  });

  it('rejects the same scoped user on a different store through the real API route', async () => {
    const cookie = await createAuthenticatedCookie();

    const before = await prisma.saleCredit.count({
      where: { saleId: crossStoreSaleId },
    });

    const request = new NextRequest(
      `http://localhost/api/sales/${crossStoreSaleId}/credit`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie,
          origin: 'http://localhost',
        },
        body: JSON.stringify({
          customerId: customerA!.id,
          amount: 1000,
          approverEmail: managerUser!.email,
          approverPassword: managerPassword,
        }),
      },
    );

    const response = await creditPost(request, {
      params: Promise.resolve({ id: crossStoreSaleId }),
    });

    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.error).toBe('Not authorized to access this store');

    const after = await prisma.saleCredit.count({
      where: { saleId: crossStoreSaleId },
    });
    expect(after).toBe(before);

    const sale = await prisma.sale.findUniqueOrThrow({
      where: { id: crossStoreSaleId },
      select: { status: true },
    });
    expect(sale.status).toBe('PENDING');
  });
});
