-- P1 supplier payments
CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "cashSessionId" TEXT,
    "createdBy" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_payments_organizationId_idx" ON "supplier_payments"("organizationId");
CREATE INDEX "supplier_payments_storeId_idx" ON "supplier_payments"("storeId");
CREATE INDEX "supplier_payments_supplierId_idx" ON "supplier_payments"("supplierId");
CREATE INDEX "supplier_payments_purchaseId_idx" ON "supplier_payments"("purchaseId");
CREATE INDEX "supplier_payments_cashSessionId_idx" ON "supplier_payments"("cashSessionId");
CREATE INDEX "supplier_payments_paidAt_idx" ON "supplier_payments"("paidAt");

ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_cashSessionId_fkey"
  FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
