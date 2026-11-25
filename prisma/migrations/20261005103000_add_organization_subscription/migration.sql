-- Add organization subscription state for document identity entitlement
ALTER TABLE "organizations"
  ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "subscriptionPlan" TEXT,
  ADD COLUMN "subscriptionExpiresAt" TIMESTAMP(3);

CREATE INDEX "organizations_subscriptionStatus_idx"
  ON "organizations"("subscriptionStatus");

CREATE INDEX "organizations_subscriptionExpiresAt_idx"
  ON "organizations"("subscriptionExpiresAt");
