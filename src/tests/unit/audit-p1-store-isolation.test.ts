import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    saleItem: { findFirst: vi.fn() },
    role: { findMany: vi.fn() },
    permission: { findMany: vi.fn() },
    store: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  roleRepository: {
    getAuthorizedStoreIds: vi.fn(),
    getUserRoles: vi.fn(),
  },
  userRepository: {
    findByIdWithOrganization: vi.fn(),
  },
}));

vi.mock('@omnikes/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@omnikes/repositories/role.repository', () => ({ roleRepository: mocks.roleRepository }));
vi.mock('@omnikes/repositories/user.repository', () => ({ userRepository: mocks.userRepository }));
vi.mock('@omnikes/services/auth.service', () => ({ authService: { hashPassword: vi.fn() } }));

import { AdminUserService } from '@omnikes/services/admin-user.service';
import { AdminRoleService } from '@omnikes/services/admin-role.service';
import { SaleService } from '@omnikes/services/sale.service';

describe('Audit P1 — store isolation regression tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks a store-scoped admin from editing a user assigned outside their stores', async () => {
    mocks.userRepository.findByIdWithOrganization.mockResolvedValue({
      id: 'target-user',
      email: 'target@example.test',
      userRoles: [{ role: { id: 'role-other-store', isGlobal: false, storeId: 'store-B' } }],
    });
    mocks.roleRepository.getAuthorizedStoreIds.mockResolvedValue(['store-A']);

    const service = new AdminUserService();
    await expect(service.update('org-1', 'target-user', { name: 'Changed' }, 'actor-user'))
      .rejects.toThrow('Permission required: target user is outside the actor store scope');

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks a store-scoped admin from listing organization-wide roles', async () => {
    mocks.roleRepository.getAuthorizedStoreIds.mockResolvedValue(['store-A']);

    const service = new AdminRoleService();
    await expect(service.list('org-1', 'actor-user'))
      .rejects.toThrow('Permission required: role administration requires organization-wide store scope');

    expect(mocks.prisma.role.findMany).not.toHaveBeenCalled();
  });

  it('does not find a sale item when its parent sale ID does not match', async () => {
    mocks.prisma.saleItem.findFirst.mockResolvedValue(null);
    const service = new SaleService();

    await expect(service.updateItem('item-1', 'org-1', { quantity: 2 }, 'sale-B'))
      .rejects.toThrow('Sale item not found or access denied');

    expect(mocks.prisma.saleItem.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'item-1',
        saleId: 'sale-B',
        sale: { id: 'sale-B', organizationId: 'org-1' },
      },
      select: { saleId: true },
    });
  });

  it('does not remove a sale item when its parent sale ID does not match', async () => {
    mocks.prisma.saleItem.findFirst.mockResolvedValue(null);
    const service = new SaleService();

    await expect(service.removeItem('item-1', 'org-1', 'sale-B'))
      .rejects.toThrow('Sale item not found or access denied');

    expect(mocks.prisma.saleItem.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'item-1',
        saleId: 'sale-B',
        sale: { id: 'sale-B', organizationId: 'org-1' },
      },
      select: { id: true, saleId: true },
    });
  });
});
