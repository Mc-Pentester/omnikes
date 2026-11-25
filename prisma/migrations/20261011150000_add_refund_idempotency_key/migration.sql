-- P0 security: persist idempotency keys for refund requests.
-- Nullable to preserve compatibility with existing refund records.
ALTER TABLE "refunds"
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "refunds_idempotencyKey_key"
  ON "refunds"("idempotencyKey");
