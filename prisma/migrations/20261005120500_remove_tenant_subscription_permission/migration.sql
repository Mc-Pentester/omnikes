-- The subscription entitlement is platform-only.
-- Remove the legacy tenant permission so no tenant Role can ever acquire it.
DELETE FROM "role_permissions"
WHERE "permissionId" IN (
  SELECT "id" FROM "permissions"
  WHERE "code" = 'organization.subscription.manage'
);

DELETE FROM "permissions"
WHERE "code" = 'organization.subscription.manage';
