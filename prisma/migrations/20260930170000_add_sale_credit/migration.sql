-- CreateTable
CREATE TABLE "sale_credits" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AUTHORIZED',
    "authorizedBy" TEXT NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_credits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sale_credits_saleId_key" ON "sale_credits"("saleId");

-- CreateIndex
CREATE INDEX "sale_credits_organizationId_idx" ON "sale_credits"("organizationId");

-- CreateIndex
CREATE INDEX "sale_credits_storeId_idx" ON "sale_credits"("storeId");

-- CreateIndex
CREATE INDEX "sale_credits_customerId_idx" ON "sale_credits"("customerId");

-- CreateIndex
CREATE INDEX "sale_credits_authorizedBy_idx" ON "sale_credits"("authorizedBy");

-- CreateIndex
CREATE INDEX "sale_credits_status_idx" ON "sale_credits"("status");

-- AddForeignKey
ALTER TABLE "sale_credits" ADD CONSTRAINT "sale_credits_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_credits" ADD CONSTRAINT "sale_credits_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_credits" ADD CONSTRAINT "sale_credits_saleId_fkey"
    FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_credits" ADD CONSTRAINT "sale_credits_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_credits" ADD CONSTRAINT "sale_credits_authorizedBy_fkey"
    FOREIGN KEY ("authorizedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
