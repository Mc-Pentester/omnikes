-- SALES_MANAGER can approve and supervise customer credit, including refunds of collected repayments.
-- Keep existing organizations in sync without rewriting custom role permissions.
INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT
  'sales-manager-payment-refund-' || md5(r."id" || ':' || p."id"),
  r."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "roles" r
JOIN "permissions" p ON p."code" = 'payment.refund'
WHERE r."organizationId" IS NOT NULL
  AND r."name" = 'SALES_MANAGER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
