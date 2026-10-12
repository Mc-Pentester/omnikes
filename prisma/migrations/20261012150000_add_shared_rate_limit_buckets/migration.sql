-- Shared rate-limit buckets allow all app processes using the same PostgreSQL database
-- to enforce one atomic quota without requiring Redis or another remote service.
CREATE TABLE "rate_limit_buckets" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "resetTime" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rate_limit_buckets_identifier_key"
    ON "rate_limit_buckets"("identifier");

CREATE INDEX "rate_limit_buckets_resetTime_idx"
    ON "rate_limit_buckets"("resetTime");
