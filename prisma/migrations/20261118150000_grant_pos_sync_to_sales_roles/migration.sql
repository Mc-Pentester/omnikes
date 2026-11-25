-- Existing installations keep their standard role grants during upgrades.
-- Grant draft POS cart synchronization to every standard role that can create sales.
INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT
  'rp-sale-pos-sync-sales-' || md5(r."id"),
  r."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "roles" r
JOIN "permissions" p ON p."code" = 'sale.pos.sync'
WHERE r."name" IN ('MANAGER', 'SALES_MANAGER', 'STORE_MANAGER', 'SELLER')
  AND r."isGlobal" = TRUE
  AND r."storeId" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
