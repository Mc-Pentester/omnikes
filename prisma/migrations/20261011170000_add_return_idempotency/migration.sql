-- Persist return idempotency keys without changing existing return records.
ALTER TABLE "returns"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "idempotencyRequestHash" TEXT;

CREATE UNIQUE INDEX "returns_organizationId_idempotencyKey_key"
  ON "returns"("organizationId", "idempotencyKey");
