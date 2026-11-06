import { Prisma } from '@prisma/client';

type RbacTransaction = Prisma.TransactionClient;

interface StandardRoleDefinition {
  name: string;
  description: string;
  permissionCodes: readonly string[] | null;
}

// These are tenant roles. isGlobal means all stores in one organization,
// never a platform-wide role. ADMIN receives the tenant permission catalogue;
// every operational role is explicitly least-privilege.
export const STANDARD_ORGANIZATION_ROLES: readonly StandardRoleDefinition[] = [
  { name: 'ADMIN', description: 'Administration complète de l’organisation et de ses magasins', permissionCodes: null },
  { name: 'MANAGER', description: 'Gestion quotidienne des magasins et supervision des opérations', permissionCodes: [
    'store.read','store.update','product.manage','product.read','customer.create','customer.read','customer.update','customer.delete',
    'sale.create','sale.read','sale.update','sale.complete','sale.credit','sale.cancel','sale.return',
    'payment.create','payment.read','payment.refund','cash.read','cash.open','cash.close','cash.movement',
    'inventory.read','inventory.adjust','report.read','user.read','user.create','user.update','audit.read',
    'supplier.read','supplier.manage','purchase.read','purchase.manage','purchase.receive','supplier.payment.read','supplier.payment.manage',
    'proforma.create','proforma.read','proforma.update','proforma.accept','proforma.cancel','proforma.convert',
    'organization.read',
  ] },
  { name: 'SUPERVISOR', description: 'Supervision des ventes, caisses et employés du magasin', permissionCodes: [
    'store.read','product.read','customer.read','customer.create','customer.update','sale.read','sale.update','sale.complete',
    'sale.cancel','sale.return','payment.read','payment.refund','cash.read','cash.close','cash.movement',
    'inventory.read','report.read','user.read','audit.read','proforma.read',
  ] },
  { name: 'CASHIER', description: 'Encaissement des ventes et opérations courantes de caisse', permissionCodes: [
    'sale.create','sale.read','sale.complete','payment.create','payment.read','product.read','inventory.read','store.read',
    'cash.read','cash.open','cash.close','cash.movement',
  ] },
  { name: 'SALES_ASSOCIATE', description: 'Vente, suivi des clients et préparation des proformas', permissionCodes: [
    'sale.create','sale.read','customer.create','customer.read','customer.update','product.read','inventory.read',
    'proforma.create','proforma.read','proforma.update','proforma.accept','store.read',
  ] },
  { name: 'INVENTORY_MANAGER', description: 'Gestion des produits, inventaires et réceptions', permissionCodes: [
    'inventory.read','inventory.adjust','product.manage','product.read','purchase.read','purchase.receive','supplier.read','report.read','store.read',
  ] },
  { name: 'WAREHOUSE_CLERK', description: 'Réception, rangement et mouvements physiques des marchandises', permissionCodes: [
    'inventory.read','product.read','purchase.read','purchase.receive','store.read',
  ] },
  { name: 'PURCHASING_MANAGER', description: 'Gestion des fournisseurs, commandes et achats', permissionCodes: [
    'supplier.read','supplier.manage','purchase.read','purchase.manage','purchase.receive','supplier.payment.read','supplier.payment.manage',
    'product.read','inventory.read','store.read','report.read',
  ] },
  { name: 'ACCOUNTANT', description: 'Consultation des opérations comptables et rapports financiers', permissionCodes: [
    'report.read','sale.read','payment.read','cash.read','purchase.read','supplier.payment.read','customer.read','audit.read','store.read',
  ] },
  { name: 'SALES_MANAGER', description: 'Pilotage commercial, clients, ventes et proformas', permissionCodes: [
    'sale.create','sale.read','sale.update','sale.complete','sale.credit','customer.create','customer.read','customer.update','customer.delete',
    'proforma.create','proforma.read','proforma.update','proforma.accept','proforma.cancel','proforma.convert',
    'report.read','product.read','inventory.read','store.read',
  ] },
  { name: 'CUSTOMER_SERVICE', description: 'Service clientèle, suivi des clients et traitement des demandes', permissionCodes: [
    'customer.create','customer.read','customer.update','sale.read','sale.return','payment.read','proforma.read','product.read','store.read',
  ] },
];

export async function provisionStandardOrganizationRoles(
  tx: RbacTransaction,
  organizationId: string,
): Promise<{ adminRoleId: string }> {
  const catalog = await tx.permission.findMany({ select: { id: true, code: true } });
  const permissionIdByCode = new Map(catalog.map((permission) => [permission.code, permission.id]));
  if (catalog.length === 0) {
    throw new Error('No permissions are configured; cannot provision standard organization roles.');
  }

  let adminRoleId = '';
  for (const definition of STANDARD_ORGANIZATION_ROLES) {
    const existing = await tx.role.findFirst({
      where: { organizationId, name: definition.name, isGlobal: true, storeId: null },
      select: { id: true },
    });
    if (existing) {
      if (definition.name === 'ADMIN') adminRoleId = existing.id;
      continue; // Never overwrite a customized role or its assignments.
    }

    const permissionIds = definition.permissionCodes === null
      ? catalog.map((permission) => permission.id)
      : definition.permissionCodes.map((code) => {
          const id = permissionIdByCode.get(code);
          if (!id) throw new Error(`Missing permission "${code}" required by standard role "${definition.name}".`);
          return id;
        });

    const role = await tx.role.create({
      data: {
        organizationId,
        name: definition.name,
        description: definition.description,
        isGlobal: true,
        storeId: null,
      },
      select: { id: true },
    });

    await tx.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
    if (definition.name === 'ADMIN') adminRoleId = role.id;
  }

  if (!adminRoleId) throw new Error('Standard ADMIN role could not be provisioned.');
  return { adminRoleId };
}
