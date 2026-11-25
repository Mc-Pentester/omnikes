-- Bound manager credit approvals to a 15-minute completion window.
-- Existing pending approvals receive an expiry relative to their original approval time.
ALTER TABLE "sale_credits"
ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "sale_credits"
SET "expiresAt" = "authorizedAt" + INTERVAL '15 minutes'
WHERE status = 'APPROVED_PENDING_COMPLETION';
