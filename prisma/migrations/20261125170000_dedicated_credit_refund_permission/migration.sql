-- Separate refunds of collected customer-credit repayments from ordinary sale-payment refunds.
-- Revoke only the grant created by the earlier migration for SALES_MANAGER; preserve
-- any independently configured payment.refund grants on other roles.
DELETE FROM "role_permissions" rp
USING "roles" r
WHERE rp."roleId" = r."id"
  AND r."organizationId" IS NOT NULL
  AND r."name" = 'SALES_MANAGER'
  AND rp."id" LIKE 'sales-manager-payment-refund-%';

INSERT INTO "permissions" ("id", "code", "description", "module", "createdAt")
VALUES (
  'credit-refund-permission',
  'credit.refund',
  'Refund collected customer-credit repayments linked to a completed return',
  'credit',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

WITH credit_refund_grants("roleName") AS (
  VALUES
    ('ADMIN'),
    ('MANAGER'),
    ('SUPERVISOR'),
    ('SALES_MANAGER'),
    ('STORE_MANAGER')
)
INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT
  'credit-refund-' || md5(r."id" || ':' || p."id"),
  r."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "roles" r
JOIN credit_refund_grants g ON g."roleName" = r."name"
JOIN "permissions" p ON p."code" = 'credit.refund'
WHERE r."organizationId" IS NOT NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
