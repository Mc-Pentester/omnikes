-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "applyTax" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "taxRate" DECIMAL(5,4) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "sessions_tokenHash_idx" ON "sessions"("tokenHash");
