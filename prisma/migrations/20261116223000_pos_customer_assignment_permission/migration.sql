-- Additive RBAC update for POS customer assignment. Existing role grants are preserved.
INSERT INTO "permissions" ("id", "code", "description", "module", "createdAt")
VALUES (
  'perm-sale-customer-assign-v1',
  'sale.customer.assign',
  'Associer ou retirer un client d’une vente en brouillon',
  'sales',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

-- CASHIER can look up customers and assign one to its own pending sale.
INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT
  'rp-customer-read-cashier-' || md5(r."id"),
  r."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "roles" r
JOIN "permissions" p ON p."code" = 'customer.read'
WHERE r."name" = 'CASHIER' AND r."isGlobal" = TRUE AND r."storeId" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT
  'rp-sale-customer-assign-' || md5(r."id"),
  r."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "roles" r
JOIN "permissions" p ON p."code" = 'sale.customer.assign'
WHERE r."name" IN ('CASHIER', 'SALES_ASSOCIATE')
  AND r."isGlobal" = TRUE
  AND r."storeId" IS NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
