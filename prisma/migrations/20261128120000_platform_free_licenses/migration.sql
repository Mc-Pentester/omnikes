ALTER TABLE "organizations"
  ADD COLUMN "freeLicenseReason" TEXT,
  ADD COLUMN "freeLicenseGrantedAt" TIMESTAMP(3),
  ADD COLUMN "freeLicenseGrantedBy" TEXT;

-- Existing subscription records are deliberately untouched. Free licenses are
-- represented by subscriptionStatus = FREE and may have no expiration date.
