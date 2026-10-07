CREATE TABLE "cash_sessions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "openedBy" TEXT NOT NULL,
  "closedBy" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "openingAmount" DECIMAL(12,2) NOT NULL,
  "expectedAmount" DECIMAL(12,2),
  "countedAmount" DECIMAL(12,2),
  "difference" DECIMAL(12,2),
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cash_movements" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "cashSessionId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "referenceId" TEXT,
  "referenceType" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_openedBy_fkey" FOREIGN KEY ("openedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closedBy_fkey" FOREIGN KEY ("closedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "cash_sessions_organizationId_idx" ON "cash_sessions"("organizationId");
CREATE INDEX "cash_sessions_storeId_idx" ON "cash_sessions"("storeId");
CREATE INDEX "cash_sessions_openedBy_idx" ON "cash_sessions"("openedBy");
CREATE INDEX "cash_sessions_status_idx" ON "cash_sessions"("status");
CREATE INDEX "cash_sessions_openedAt_idx" ON "cash_sessions"("openedAt");
CREATE INDEX "cash_movements_organizationId_idx" ON "cash_movements"("organizationId");
CREATE INDEX "cash_movements_storeId_idx" ON "cash_movements"("storeId");
CREATE INDEX "cash_movements_cashSessionId_idx" ON "cash_movements"("cashSessionId");
CREATE INDEX "cash_movements_type_idx" ON "cash_movements"("type");
CREATE INDEX "cash_movements_referenceId_idx" ON "cash_movements"("referenceId");
CREATE INDEX "cash_movements_createdAt_idx" ON "cash_movements"("createdAt");

CREATE UNIQUE INDEX "cash_sessions_one_open_per_store" ON "cash_sessions"("organizationId", "storeId") WHERE "status" = 'OPEN';
