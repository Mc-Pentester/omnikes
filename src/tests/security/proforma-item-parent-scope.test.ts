import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proformaService } from '@omnikes/services/proforma.service';
import { prisma } from '@omnikes/lib/prisma';
import { proformaRepository } from '@omnikes/repositories/proforma.repository';

vi.mock('@omnikes/lib/prisma', () => ({
  prisma: {
    proformaItem: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@omnikes/repositories/proforma.repository', () => ({
  proformaRepository: {
    findById: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    listItems: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@omnikes/repositories/product-variant.repository', () => ({
  productVariantRepository: {
    findByIdWithOrganizationCheck: vi.fn(),
  },
}));

vi.mock('@omnikes/services/store.service', () => ({
  storeService: {
    validateStoreBelongsToOrganization: vi.fn(),
  },
}));

const prismaMock = prisma as unknown as {
  proformaItem: { findFirst: ReturnType<typeof vi.fn> };
};
const repositoryMock = proformaRepository as unknown as {
  findById: ReturnType<typeof vi.fn>;
  updateItem: ReturnType<typeof vi.fn>;
  deleteItem: ReturnType<typeof vi.fn>;
};

describe('Proforma item parent scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.proformaItem.findFirst.mockResolvedValue(null);
  });

  it('rejects updating an item unless it belongs to the proforma in the route', async () => {
    await expect(
      proformaService.updateItem('item-from-store-b', 'proforma-store-a', 'org-a', {
        quantity: 2,
      }),
    ).rejects.toThrow('Proforma item not found or access denied');

    expect(prismaMock.proformaItem.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'item-from-store-b',
        proformaId: 'proforma-store-a',
        proforma: { organizationId: 'org-a' },
      },
      include: { proforma: true, variant: true },
    });
    expect(repositoryMock.updateItem).not.toHaveBeenCalled();
  });

  it('rejects deleting an item unless it belongs to the proforma in the route', async () => {
    await expect(
      proformaService.removeItem('item-from-store-b', 'proforma-store-a', 'org-a'),
    ).rejects.toThrow('Proforma item not found or access denied');

    expect(prismaMock.proformaItem.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'item-from-store-b',
        proformaId: 'proforma-store-a',
        proforma: { organizationId: 'org-a' },
      },
      include: { proforma: true },
    });
    expect(repositoryMock.deleteItem).not.toHaveBeenCalled();
  });
});
