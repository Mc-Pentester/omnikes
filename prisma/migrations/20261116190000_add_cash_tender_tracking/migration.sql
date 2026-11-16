-- Nullable tender fields preserve historical payment rows without inferred values.
ALTER TABLE "payments"
  ADD COLUMN "cashReceived" DECIMAL(12,2),
  ADD COLUMN "changeGiven" DECIMAL(12,2);
