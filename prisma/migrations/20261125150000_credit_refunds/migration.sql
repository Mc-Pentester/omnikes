-- Preserve immutable credit repayments while tracking refunds separately.
ALTER TABLE "credit_payments"
  ADD COLUMN "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TABLE "credit_refunds" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "saleCreditId" TEXT NOT NULL,
  "creditPaymentId" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "processedBy" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "method" TEXT NOT NULL,
  "reference" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "credit_refunds_organizationId_idempotencyKey_key"
  ON "credit_refunds"("organizationId", "idempotencyKey");
CREATE INDEX "credit_refunds_organizationId_storeId_createdAt_idx"
  ON "credit_refunds"("organizationId", "storeId", "createdAt");
CREATE INDEX "credit_refunds_saleCreditId_createdAt_idx"
  ON "credit_refunds"("saleCreditId", "createdAt");
CREATE INDEX "credit_refunds_creditPaymentId_createdAt_idx"
  ON "credit_refunds"("creditPaymentId", "createdAt");
CREATE INDEX "credit_refunds_returnId_idx" ON "credit_refunds"("returnId");
CREATE INDEX "credit_refunds_processedBy_idx" ON "credit_refunds"("processedBy");

ALTER TABLE "credit_refunds"
  ADD CONSTRAINT "credit_refunds_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "credit_refunds_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "credit_refunds_saleCreditId_fkey"
    FOREIGN KEY ("saleCreditId") REFERENCES "sale_credits"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "credit_refunds_creditPaymentId_fkey"
    FOREIGN KEY ("creditPaymentId") REFERENCES "credit_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "credit_refunds_returnId_fkey"
    FOREIGN KEY ("returnId") REFERENCES "returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "credit_refunds_processedBy_fkey"
    FOREIGN KEY ("processedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_payments" ADD CONSTRAINT "credit_payments_refundedAmount_check" CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= "amount");
ALTER TABLE "credit_refunds" ADD CONSTRAINT "credit_refunds_amount_positive_check" CHECK ("amount" > 0);
