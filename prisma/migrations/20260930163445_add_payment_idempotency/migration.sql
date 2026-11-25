-- CreateTable
CREATE TABLE "payment_idempotency" (
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

    CONSTRAINT "payment_idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_idempotency_saleId_idx" ON "payment_idempotency"("saleId");

-- CreateIndex
CREATE INDEX "payment_idempotency_userId_idx" ON "payment_idempotency"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_idempotency_organizationId_key_key" ON "payment_idempotency"("organizationId", "key");
