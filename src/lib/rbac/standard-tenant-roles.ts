import type { Prisma } from '@prisma/client';

// Standard tenant roles are organization-scoped. Store-specific variants can
// still be created by an administrator from the role editor.
export const STANDARD_TENANT_ROLES = [
  {
    name: 'MANAGER',
    description: 'Gestion quotidienne de l’organisation et supervision commerciale',
    permissions: [
      'store.read', 'store.update', 'product.manage', 'product.read', 'inventory.read', 'inventory.adjust',
      'customer.create', 'customer.read', 'customer.update', 'customer.delete',
      'proforma.create', 'proforma.read', 'proforma.update', 'proforma.accept', 'proforma.cancel', 'proforma.convert',
      'sale.create', 'sale.read', 'sale.update', 'sale.complete', 'sale.credit', 'sale.cancel', 'sale.return',
      'payment.create', 'payment.read', 'payment.refund', 'cash.read', 'cash.open', 'cash.close', 'cash.movement',
      'report.read', 'supplier.read', 'supplier.manage', 'purchase.read', 'purchase.manage', 'purchase.receive',
      'supplier.payment.manage', 'supplier.payment.read', 'user.read', 'user.create', 'user.update',
      'role.read', 'audit.read', 'organization.read',
    ],
  },
  {
    name: 'STORE_MANAGER',
    description: 'Gestion opérationnelle des magasins et de leurs équipes',
    permissions: [
      'store.read', 'product.manage', 'product.read', 'inventory.read', 'inventory.adjust',
      'customer.create', 'customer.read', 'customer.update',
      'proforma.create', 'proforma.read', 'proforma.update', 'proforma.accept', 'proforma.convert',
      'sale.create', 'sale.read', 'sale.update', 'sale.complete', 'sale.credit', 'sale.cancel', 'sale.return',
      'payment.create', 'payment.read', 'payment.refund', 'cash.read', 'cash.open', 'cash.close', 'cash.movement',
      'report.read', 'supplier.read', 'purchase.read', 'purchase.receive',
    ],
  },
  {
    name: 'SELLER',
    description: 'Vente, devis, proformas et consultation des clients et produits',
    permissions: [
      'store.read', 'product.read', 'customer.create', 'customer.read', 'customer.update',
      'proforma.create', 'proforma.read', 'proforma.update', 'sale.create', 'sale.read', 'sale.complete',
      'payment.create', 'payment.read', 'inventory.read',
    ],
  },
  {
    name: 'INVENTORY_MANAGER',
    description: 'Gestion des produits, stocks et inventaires',
    permissions: ['store.read', 'product.manage', 'product.read', 'inventory.read', 'inventory.adjust', 'report.read', 'purchase.read', 'purchase.receive'],
  },
  {
    name: 'PURCHASING_MANAGER',
    description: 'Gestion des fournisseurs, achats et réceptions',
    permissions: ['store.read', 'product.read', 'inventory.read', 'supplier.read', 'supplier.manage', 'purchase.read', 'purchase.manage', 'purchase.receive', 'supplier.payment.read'],
  },
  {
    name: 'ACCOUNTANT',
    description: 'Consultation et suivi comptable et financier',
    permissions: ['store.read', 'sale.read', 'payment.read', 'cash.read', 'report.read', 'customer.read', 'supplier.read', 'purchase.read', 'supplier.payment.read', 'audit.read'],
  },
  {
    name: 'AUDITOR',
    description: 'Consultation en lecture seule et traçabilité',
    permissions: [
      'store.read', 'product.read', 'inventory.read', 'customer.read', 'proforma.read',
      'sale.read', 'payment.read', 'cash.read', 'report.read', 'organization.read',
      'user.read', 'role.read', 'audit.read', 'supplier.read', 'purchase.read', 'supplier.payment.read',
    ],
  },
] as const;

export async function provisionStandardTenantRoles(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  const allCodes = [...new Set(STANDARD_TENANT_ROLES.flatMap((role) => [...role.permissions]))];
  const permissions = await tx.permission.findMany({
    where: { code: { in: allCodes } },
    select: { id: true, code: true },
  });
  const permissionIds = new Map(permissions.map((permission) => [permission.code, permission.id]));
  const missing = allCodes.filter((code) => !permissionIds.has(code));
  if (missing.length) {
    throw new Error('Standard RBAC catalogue is incomplete: ' + missing.join(', '));
  }

  for (const definition of STANDARD_TENANT_ROLES) {
    const existing = await tx.role.findFirst({
      where: { organizationId, name: definition.name },
      select: { id: true },
    });
    if (existing) continue;

    const role = await tx.role.create({
      data: {
        organizationId,
        name: definition.name,
        description: definition.description,
        isGlobal: true,
      },
      select: { id: true },
    });
    await tx.rolePermission.createMany({
      data: definition.permissions.map((code) => ({
        roleId: role.id,
        permissionId: permissionIds.get(code)!,
      })),
      skipDuplicates: true,
    });
  }
}
