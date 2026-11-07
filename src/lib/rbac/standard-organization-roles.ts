import type { Prisma } from '@prisma/client';
import rbacCatalog from '../../../config/rbac-catalog.json';

type RbacTransaction = Prisma.TransactionClient;

interface StandardRoleDefinition {
  name: string;
  description: string;
  permissionCodes: readonly string[] | null;
}

// The JSON catalog is shared with the offline Windows bootstrapper.
export const STANDARD_ORGANIZATION_ROLES = rbacCatalog.standardRoles as readonly StandardRoleDefinition[];
export const STANDARD_PERMISSION_CODES = rbacCatalog.permissionCodes as readonly string[];

function moduleFromCode(code: string): string {
  const prefix = code.split('.')[0];
  if (prefix === 'sale' || prefix === 'payment') return 'sales';
  if (prefix === 'report') return 'reports';
  return prefix;
}

export async function ensureStandardPermissionCatalog(tx: RbacTransaction): Promise<void> {
  await tx.permission.createMany({
    data: STANDARD_PERMISSION_CODES.map((code) => ({
      code,
      description: 'Permission ' + code,
      module: moduleFromCode(code),
    })),
    skipDuplicates: true,
  });
}

export async function provisionStandardOrganizationRoles(
  tx: RbacTransaction,
  organizationId: string,
): Promise<{ adminRoleId: string }> {
  await ensureStandardPermissionCatalog(tx);
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
      continue;
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
