CREATE TABLE "supplier_payment_idempotency" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "storeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_payment_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_payment_idempotency_organizationId_key_key"
ON "supplier_payment_idempotency"("organizationId", "key");

CREATE INDEX "supplier_payment_idempotency_supplierId_idx"
ON "supplier_payment_idempotency"("supplierId");

CREATE INDEX "supplier_payment_idempotency_purchaseId_idx"
ON "supplier_payment_idempotency"("purchaseId");

CREATE INDEX "supplier_payment_idempotency_userId_idx"
ON "supplier_payment_idempotency"("userId");

ALTER TABLE "supplier_payment_idempotency"
ADD CONSTRAINT "supplier_payment_idempotency_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_payment_idempotency"
ADD CONSTRAINT "supplier_payment_idempotency_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_payment_idempotency"
ADD CONSTRAINT "supplier_payment_idempotency_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_payment_idempotency"
ADD CONSTRAINT "supplier_payment_idempotency_purchaseId_fkey"
FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_payment_idempotency"
ADD CONSTRAINT "supplier_payment_idempotency_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
