-- CreateIndex
CREATE TABLE IF NOT EXISTS "checkout_idempotency" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkout_idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkout_idempotency_organizationId_key_key" ON "checkout_idempotency"("organizationId", "key");

-- CreateIndex
CREATE INDEX "checkout_idempotency_saleId_idx" ON "checkout_idempotency"("saleId");

-- CreateIndex
CREATE INDEX "checkout_idempotency_userId_idx" ON "checkout_idempotency"("userId");
