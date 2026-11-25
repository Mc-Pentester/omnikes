-- Customer credit lifecycle: organization policy, customer limits, PIN credentials,
-- due-date snapshots and an append-only repayment ledger. All changes are additive.
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "creditDefaultDueDays" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "creditLimit" DECIMAL(12,2);

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "creditPinHash" TEXT,
  ADD COLUMN IF NOT EXISTS "creditPinFailedAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "creditPinLockedUntil" TIMESTAMP(3);

ALTER TABLE "sale_credits"
  ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3);

-- Backfill existing credits from their authorization date using the safe
-- organization default. Existing amounts and authorization history are untouched.
UPDATE "sale_credits" sc
SET "dueAt" = sc."authorizedAt" + (o."creditDefaultDueDays" * INTERVAL '1 day')
FROM "organizations" o
WHERE sc."organizationId" = o."id" AND sc."dueAt" IS NULL;

ALTER TABLE "sale_credits" ALTER COLUMN "dueAt" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "credit_payments" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "saleCreditId" TEXT NOT NULL,
  "receivedBy" TEXT NOT NULL,
  "cashSessionId" TEXT,
  "amount" DECIMAL(12,2) NOT NULL,
  "method" TEXT NOT NULL,
  "reference" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_payments_amount_positive" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "credit_payments_organizationId_idempotencyKey_key"
  ON "credit_payments"("organizationId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "credit_payments_organizationId_storeId_createdAt_idx"
  ON "credit_payments"("organizationId", "storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "credit_payments_saleCreditId_createdAt_idx"
  ON "credit_payments"("saleCreditId", "createdAt");
CREATE INDEX IF NOT EXISTS "credit_payments_receivedBy_idx"
  ON "credit_payments"("receivedBy");

DO $$ BEGIN
  ALTER TABLE "credit_payments" ADD CONSTRAINT "credit_payments_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "credit_payments" ADD CONSTRAINT "credit_payments_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "credit_payments" ADD CONSTRAINT "credit_payments_saleCreditId_fkey"
    FOREIGN KEY ("saleCreditId") REFERENCES "sale_credits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "credit_payments" ADD CONSTRAINT "credit_payments_receivedBy_fkey"
    FOREIGN KEY ("receivedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "credit_payments" ADD CONSTRAINT "credit_payments_cashSessionId_fkey"
    FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Dedicated permissions for collection, customer limits, settings and reporting.
INSERT INTO "permissions" ("id", "code", "description", "module", "createdAt")
VALUES
  ('credit-request-permission','credit.request','Request customer credit at POS','credit',CURRENT_TIMESTAMP),
  ('credit-payment-receive-permission','credit.payment.receive','Receive customer credit repayments','credit',CURRENT_TIMESTAMP),
  ('credit-view-permission','credit.view','View customer credit balances','credit',CURRENT_TIMESTAMP),
  ('credit-history-view-permission','credit.history.view','View customer credit repayment history','credit',CURRENT_TIMESTAMP),
  ('credit-report-view-permission','credit.report.view','View customer credit reports','credit',CURRENT_TIMESTAMP),
  ('credit-limit-manage-permission','credit.limit.manage','Manage customer credit limits','credit',CURRENT_TIMESTAMP),
  ('credit-settings-manage-permission','credit.settings.manage','Manage organization credit policy','credit',CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Grant narrowly by role. No credit approval permission is given to cashiers.
INSERT INTO "role_permissions" ("id","roleId","permissionId","createdAt")
SELECT 'credit-lifecycle-' || md5(r."id" || ':' || p."id"), r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" r
JOIN "permissions" p ON (
  (p."code" IN ('credit.payment.receive','credit.view','credit.history.view') AND r."name" IN ('ADMIN','MANAGER','SUPERVISOR','STORE_MANAGER','SALES_MANAGER','CASHIER'))
  OR (p."code" = 'credit.request' AND r."name" IN ('ADMIN','MANAGER','SUPERVISOR','STORE_MANAGER','SALES_MANAGER','CASHIER','SELLER','SALES_ASSOCIATE'))
  OR (p."code" IN ('credit.report.view','credit.view','credit.history.view') AND r."name" IN ('ADMIN','MANAGER','SUPERVISOR','STORE_MANAGER','SALES_MANAGER','ACCOUNTANT','AUDITOR'))
  OR (p."code" = 'credit.limit.manage' AND r."name" IN ('ADMIN','MANAGER','STORE_MANAGER','SALES_MANAGER'))
  OR (p."code" = 'credit.settings.manage' AND r."name" IN ('ADMIN'))
)
ON CONFLICT ("roleId","permissionId") DO NOTHING;
