-- Add a dedicated permission for approving customer credit.
-- This migration is additive and safe to re-run; it does not rewrite existing role grants.
INSERT INTO "permissions" ("id", "code", "description", "module", "createdAt")
VALUES (
  'credit-approve-permission',
  'credit.approve',
  'Approve customer credit after re-authentication by a different authorized user',
  'credit',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

-- Backfill the permission to existing managerial roles. The permission is
-- intentionally not granted to CASHIER, SELLER, or SALES_ASSOCIATE.
INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT
  'credit-approve-' || md5(r."id" || ':' || p."id"),
  r."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "roles" r
JOIN "permissions" p ON p."code" = 'credit.approve'
WHERE r."name" IN ('ADMIN', 'MANAGER', 'SUPERVISOR', 'STORE_MANAGER', 'SALES_MANAGER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
