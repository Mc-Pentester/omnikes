import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refundService } from '@omnikes/services/refund.service';
import { prisma } from '@omnikes/lib/prisma';

vi.mock('@omnikes/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

describe('RefundService', () => {
  const mockPayment = {
    id: 'clh1234567890ab',
    saleId: 'clh1234567890cd',
    method: 'CASH',
    amount: 1000,
    refundedAmount: 0,
    sale: {
      id: 'clh1234567890cd',
      organizationId: 'clh1234567890ef',
      storeId: 'clh1234567890gh',
      store: {
        id: 'clh1234567890gh',
        organizationId: 'clh1234567890ef',
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes a valid partial refund', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'clh1234567890ab' }]),
      payment: {
        findUnique: vi.fn().mockResolvedValue(mockPayment),
        update: vi.fn().mockResolvedValue({}),
      },
      refund: {
        create: vi.fn().mockResolvedValue({
          id: 'clh1234567890ij',
          amount: 500,
          status: 'COMPLETED',
        }),
      },
      cashSession: {
        findFirst: vi.fn().mockResolvedValue({ id: 'clh1234567890kl' }),
      },
      cashMovement: {
        create: vi.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    const result = await refundService.process('clh1234567890ef', 'clh1234567890mn', {
      paymentId: 'clh1234567890ab',
      amount: 500,
    });

    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: 'clh1234567890ab' },
      data: {
        refundedAmount: 500,
        status: 'COMPLETED',
      },
    });
    expect(tx.refund.create).toHaveBeenCalled();
  });

  it('rejects refund when amount exceeds remaining refundable', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'clh1234567890ab' }]),
      payment: {
        findUnique: vi.fn().mockResolvedValue(mockPayment),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    await expect(
      refundService.process('clh1234567890ef', 'clh1234567890mn', {
        paymentId: 'clh1234567890ab',
        amount: 1500,
      })
    ).rejects.toThrow('Refund amount exceeds remaining refundable amount');
  });

  it('sets payment status to REFUNDED when fully refunded', async () => {
    const cardPayment = { ...mockPayment, method: 'CARD' };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'clh1234567890ab' }]),
      payment: {
        findUnique: vi.fn().mockResolvedValue(cardPayment),
        update: vi.fn().mockResolvedValue({}),
      },
      refund: {
        create: vi.fn().mockResolvedValue({
          id: 'clh1234567890ij',
          amount: 1000,
          status: 'COMPLETED',
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    await refundService.process('clh1234567890ef', 'clh1234567890mn', {
      paymentId: 'clh1234567890ab',
      amount: 1000,
    });

    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: 'clh1234567890ab' },
      data: {
        refundedAmount: 1000,
        status: 'REFUNDED',
      },
    });
  });

  it('requires open cash session for CASH refunds', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'clh1234567890ab' }]),
      payment: {
        findUnique: vi.fn().mockResolvedValue(mockPayment),
        update: vi.fn().mockResolvedValue({}),
      },
      refund: {
        create: vi.fn().mockResolvedValue({}),
      },
      cashSession: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    await expect(
      refundService.process('clh1234567890ef', 'clh1234567890mn', {
        paymentId: 'clh1234567890ab',
        amount: 500,
      })
    ).rejects.toThrow('An open cash session is required for CASH refunds');
  });

  it('rejects refund when payment does not belong to organization', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    await expect(
      refundService.process('clh1234567890ef', 'clh1234567890mn', {
        paymentId: 'clh1234567890ab',
        amount: 500,
      })
    ).rejects.toThrow('Payment not found or access denied');
  });
});
