-- P0: Add returns and refunds support
-- Add returnedQuantity to sale_items for partial returns
ALTER TABLE "sale_items"
  ADD COLUMN "returnedQuantity" INTEGER NOT NULL DEFAULT 0;

-- Add refundedAmount to payments for tracking refunds
ALTER TABLE "payments"
  ADD COLUMN "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Create returns table
CREATE TABLE "returns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalRefunded" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reason" TEXT,
    "returnedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

-- Create return_items table
CREATE TABLE "return_items" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalRefunded" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- Create refunds table
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "returnId" TEXT,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "processedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- Add indexes for returns
CREATE INDEX "returns_organizationId_idx" ON "returns"("organizationId");
CREATE INDEX "returns_storeId_idx" ON "returns"("storeId");
CREATE INDEX "returns_saleId_idx" ON "returns"("saleId");
CREATE INDEX "returns_status_idx" ON "returns"("status");
CREATE INDEX "returns_createdAt_idx" ON "returns"("createdAt");

-- Add indexes for return_items
CREATE INDEX "return_items_returnId_idx" ON "return_items"("returnId");
CREATE INDEX "return_items_saleItemId_idx" ON "return_items"("saleItemId");

-- Add indexes for refunds
CREATE INDEX "refunds_returnId_idx" ON "refunds"("returnId");
CREATE INDEX "refunds_paymentId_idx" ON "refunds"("paymentId");
CREATE INDEX "refunds_status_idx" ON "refunds"("status");
CREATE INDEX "refunds_createdAt_idx" ON "refunds"("createdAt");

-- Add foreign key constraints for returns
ALTER TABLE "returns"
  ADD CONSTRAINT "returns_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "returns"
  ADD CONSTRAINT "returns_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "returns"
  ADD CONSTRAINT "returns_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "sales"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "returns"
  ADD CONSTRAINT "returns_returnedBy_fkey"
  FOREIGN KEY ("returnedBy") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add foreign key constraints for return_items
ALTER TABLE "return_items"
  ADD CONSTRAINT "return_items_returnId_fkey"
  FOREIGN KEY ("returnId") REFERENCES "returns"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "return_items"
  ADD CONSTRAINT "return_items_saleItemId_fkey"
  FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Add foreign key constraints for refunds
ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_returnId_fkey"
  FOREIGN KEY ("returnId") REFERENCES "returns"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_processedBy_fkey"
  FOREIGN KEY ("processedBy") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
