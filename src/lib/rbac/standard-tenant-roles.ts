import type { Prisma } from '@prisma/client';
import catalog from '../../../config/rbac-catalog.json';
export const TENANT_PERMISSION_CODES = catalog.permissionCodes;
const adminDefinition = catalog.standardRoles.find((role) => role.name === 'ADMIN');
const cashierDefinition = catalog.standardRoles.find((role) => role.name === 'CASHIER');
if (!adminDefinition || !cashierDefinition) throw new Error('RBAC catalogue must define ADMIN and CASHIER roles.');
export const ADMIN_ROLE = { name: adminDefinition.name, description: adminDefinition.description, permissions: 'ALL_TENANT_PERMISSIONS' as const };
export const CASHIER_ROLE = { name: cashierDefinition.name, description: cashierDefinition.description, permissions: cashierDefinition.permissionCodes ?? [] };
export const STANDARD_TENANT_ROLES = catalog.standardRoles
  .filter((role) => role.name !== 'ADMIN' && role.name !== 'CASHIER')
  .map((role) => ({ name: role.name, description: role.description, permissions: role.permissionCodes ?? TENANT_PERMISSION_CODES }));
export const PLATFORM_PERMISSIONS = catalog.platformPermissions;
export async function provisionStandardTenantRoles(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
  const allCodes = [...new Set(STANDARD_TENANT_ROLES.flatMap((role) => [...role.permissions]))];
  const permissions = await tx.permission.findMany({ where: { code: { in: allCodes } }, select: { id: true, code: true } });
  const permissionIds = new Map(permissions.map((permission) => [permission.code, permission.id]));
  const missing = allCodes.filter((code) => !permissionIds.has(code));
  if (missing.length) throw new Error('Standard RBAC catalogue is incomplete: ' + missing.join(', '));
  for (const definition of STANDARD_TENANT_ROLES) {
    const existing = await tx.role.findFirst({ where: { organizationId, name: definition.name, isGlobal: true, storeId: null }, select: { id: true } });
    // Never rewrite an existing standard or custom role during upgrades.
    if (existing) continue;
    const role = await tx.role.create({ data: { organizationId, name: definition.name, description: definition.description, isGlobal: true }, select: { id: true } });
    await tx.rolePermission.createMany({ data: definition.permissions.map((code) => ({ roleId: role.id, permissionId: permissionIds.get(code)! })), skipDuplicates: true });
  }
}
