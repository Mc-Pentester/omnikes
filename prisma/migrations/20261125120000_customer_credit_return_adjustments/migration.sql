-- Append-only adjustments reduce outstanding customer debt after merchandise returns.
CREATE TABLE IF NOT EXISTS "credit_adjustments" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "saleCreditId" TEXT NOT NULL,
  "returnId" TEXT,
  "processedBy" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "credit_adjustments_amount_positive" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "credit_adjustments_returnId_key" ON "credit_adjustments"("returnId");
CREATE INDEX IF NOT EXISTS "credit_adjustments_organizationId_storeId_createdAt_idx"
  ON "credit_adjustments"("organizationId","storeId","createdAt");
CREATE INDEX IF NOT EXISTS "credit_adjustments_saleCreditId_createdAt_idx"
  ON "credit_adjustments"("saleCreditId","createdAt");
CREATE INDEX IF NOT EXISTS "credit_adjustments_processedBy_idx" ON "credit_adjustments"("processedBy");

DO $$ BEGIN
  ALTER TABLE "credit_adjustments" ADD CONSTRAINT "credit_adjustments_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "credit_adjustments" ADD CONSTRAINT "credit_adjustments_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "credit_adjustments" ADD CONSTRAINT "credit_adjustments_saleCreditId_fkey"
    FOREIGN KEY ("saleCreditId") REFERENCES "sale_credits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "credit_adjustments" ADD CONSTRAINT "credit_adjustments_returnId_fkey"
    FOREIGN KEY ("returnId") REFERENCES "returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "credit_adjustments" ADD CONSTRAINT "credit_adjustments_processedBy_fkey"
    FOREIGN KEY ("processedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
