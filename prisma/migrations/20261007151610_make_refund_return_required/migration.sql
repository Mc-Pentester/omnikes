-- P0 Phase 3: Make Refund.returnId required
-- Ensure every refund is linked to a return operation
-- Verified: No existing refunds with returnId IS NULL

ALTER TABLE "refunds"
  ALTER COLUMN "returnId" SET NOT NULL;
