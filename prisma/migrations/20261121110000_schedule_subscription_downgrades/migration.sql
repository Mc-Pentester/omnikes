ALTER TABLE "organizations"
  ADD COLUMN "subscriptionPendingPlan" TEXT,
  ADD COLUMN "subscriptionPendingBillingInterval" TEXT;

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_subscriptionPendingBillingInterval_check"
  CHECK ("subscriptionPendingBillingInterval" IS NULL OR "subscriptionPendingBillingInterval" IN ('MONTHLY', 'ANNUAL'));

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_subscriptionPendingPlan_check"
  CHECK ("subscriptionPendingPlan" IS NULL OR "subscriptionPendingPlan" IN ('OMNIKES_149', 'OMNIKES_249', 'OMNIKES_299'));
