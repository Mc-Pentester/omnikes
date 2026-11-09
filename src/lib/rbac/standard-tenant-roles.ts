import type { Prisma } from '@prisma/client';
import catalog from './standard-tenant-rbac.json';

// The JSON catalogue is the single source consumed by the app, seed and Windows installer.
export const TENANT_PERMISSION_CODES = catalog.tenantPermissions;
export const CASHIER_ROLE = catalog.cashierRole;
export const STANDARD_TENANT_ROLES = catalog.standardTenantRoles;

export async function provisionStandardTenantRoles(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
  const allCodes = [...new Set(STANDARD_TENANT_ROLES.flatMap((role) => [...role.permissions]))];
  const permissions = await tx.permission.findMany({ where: { code: { in: allCodes } }, select: { id: true, code: true } });
  const permissionIds = new Map(permissions.map((permission) => [permission.code, permission.id]));
  const missing = allCodes.filter((code) => !permissionIds.has(code));
  if (missing.length) throw new Error('Standard RBAC catalogue is incomplete: ' + missing.join(', '));

  for (const definition of STANDARD_TENANT_ROLES) {
    const existing = await tx.role.findFirst({ where: { organizationId, name: definition.name }, select: { id: true } });
    // Never rewrite an existing standard or custom role during upgrades.
    if (existing) continue;
    const role = await tx.role.create({
      data: { organizationId, name: definition.name, description: definition.description, isGlobal: true },
      select: { id: true },
    });
    await tx.rolePermission.createMany({
      data: definition.permissions.map((code) => ({ roleId: role.id, permissionId: permissionIds.get(code)! })),
      skipDuplicates: true,
    });
  }
}
