ALTER TABLE "organizations"
  ADD COLUMN "subscriptionBillingInterval" TEXT,
  ADD COLUMN "subscriptionTrialStartedAt" TIMESTAMP(3),
  ADD COLUMN "subscriptionCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "organizations_subscriptionBillingInterval_idx"
  ON "organizations"("subscriptionBillingInterval");
