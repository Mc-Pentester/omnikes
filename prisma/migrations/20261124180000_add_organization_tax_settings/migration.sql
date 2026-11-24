-- Organization-owned fiscal defaults. Preserve existing tax behavior by copying
-- legacy country tax configuration to each organization during migration.
ALTER TABLE "organizations"
  ADD COLUMN "taxEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "taxRate" DECIMAL(5,4) NOT NULL DEFAULT 0;

UPDATE "organizations" AS organization
SET "taxEnabled" = true,
    "taxRate" = configuration."taxRate"
FROM "tax_configurations" AS configuration
WHERE organization."taxConfigurationId" = configuration."id";
