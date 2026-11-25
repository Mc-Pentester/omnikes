ALTER TABLE "organizations"
  ADD COLUMN "subscriptionBillingInterval" TEXT,
  ADD COLUMN "subscriptionTrialStartedAt" TIMESTAMP(3),
  ADD COLUMN "subscriptionCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "organizations_subscriptionBillingInterval_idx"
  ON "organizations"("subscriptionBillingInterval");

-- Preserve pre-existing installations: until an operator assigns a paid plan,
-- existing organizations retain Essential-level access instead of being locked out.
UPDATE "organizations"
SET "subscriptionStatus" = 'LEGACY',
    "subscriptionPlan" = 'OMNIKES_149'
WHERE "subscriptionStatus" = 'NONE'
  AND "subscriptionPlan" IS NULL;
