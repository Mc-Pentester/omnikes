-- Reconcile all customer-credit permissions for both existing and newly upgraded organizations.
-- The first credit migration can run before test seeds create roles; this migration is
-- additive and intentionally safe to run when only some standard roles already exist.
INSERT INTO "permissions" ("id", "code", "description", "module", "createdAt")
VALUES
  ('credit-request-permission', 'credit.request', 'Request customer credit during a sale', 'credit', CURRENT_TIMESTAMP),
  ('credit-payment-receive-permission', 'credit.payment.receive', 'Receive customer credit repayments', 'credit', CURRENT_TIMESTAMP),
  ('credit-view-permission', 'credit.view', 'View customer credit balances and receivables', 'credit', CURRENT_TIMESTAMP),
  ('credit-history-view-permission', 'credit.history.view', 'View customer credit payment history', 'credit', CURRENT_TIMESTAMP),
  ('credit-report-view-permission', 'credit.report.view', 'View customer credit reports', 'credit', CURRENT_TIMESTAMP),
  ('credit-limit-manage-permission', 'credit.limit.manage', 'Manage customer credit limits', 'credit', CURRENT_TIMESTAMP),
  ('credit-settings-manage-permission', 'credit.settings.manage', 'Manage organization customer-credit settings', 'credit', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

WITH credit_role_grants("roleName", "permissionCode") AS (
  VALUES
    ('ADMIN', 'credit.approve'),
    ('ADMIN', 'credit.request'),
    ('ADMIN', 'credit.payment.receive'),
    ('ADMIN', 'credit.view'),
    ('ADMIN', 'credit.history.view'),
    ('ADMIN', 'credit.report.view'),
    ('ADMIN', 'credit.limit.manage'),
    ('ADMIN', 'credit.settings.manage'),
    ('MANAGER', 'credit.approve'),
    ('MANAGER', 'credit.payment.receive'),
    ('MANAGER', 'credit.view'),
    ('MANAGER', 'credit.history.view'),
    ('MANAGER', 'credit.report.view'),
    ('MANAGER', 'credit.limit.manage'),
    ('SUPERVISOR', 'credit.approve'),
    ('SUPERVISOR', 'credit.payment.receive'),
    ('SUPERVISOR', 'credit.view'),
    ('SUPERVISOR', 'credit.history.view'),
    ('SUPERVISOR', 'credit.report.view'),
    ('STORE_MANAGER', 'credit.approve'),
    ('STORE_MANAGER', 'credit.payment.receive'),
    ('STORE_MANAGER', 'credit.view'),
    ('STORE_MANAGER', 'credit.history.view'),
    ('STORE_MANAGER', 'credit.report.view'),
    ('STORE_MANAGER', 'credit.limit.manage'),
    ('SALES_MANAGER', 'credit.approve'),
    ('SALES_MANAGER', 'credit.payment.receive'),
    ('SALES_MANAGER', 'credit.view'),
    ('SALES_MANAGER', 'credit.history.view'),
    ('SALES_MANAGER', 'credit.report.view'),
    ('SALES_MANAGER', 'credit.limit.manage'),
    ('CASHIER', 'credit.request'),
    ('CASHIER', 'credit.payment.receive'),
    ('CASHIER', 'credit.view'),
    ('CASHIER', 'credit.history.view'),
    ('SALES_ASSOCIATE', 'credit.request'),
    ('SELLER', 'credit.request'),
    ('ACCOUNTANT', 'credit.view'),
    ('ACCOUNTANT', 'credit.history.view'),
    ('ACCOUNTANT', 'credit.report.view'),
    ('AUDITOR', 'credit.view'),
    ('AUDITOR', 'credit.history.view'),
    ('AUDITOR', 'credit.report.view')
)
INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT
  'credit-rbac-' || md5(r."id" || ':' || p."id"),
  r."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "roles" r
JOIN credit_role_grants g ON g."roleName" = r."name"
JOIN "permissions" p ON p."code" = g."permissionCode"
WHERE r."organizationId" IS NOT NULL
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
