-- Product packaging prices are independent. Existing price remains the legacy unit/default price.
ALTER TABLE "organizations"
  ADD COLUMN "currencySymbol" VARCHAR(12);

ALTER TABLE "product_variants"
  ALTER COLUMN "cost" DROP NOT NULL,
  ADD COLUMN "casePrice" DECIMAL(10,2),
  ADD COLUMN "dozenPrice" DECIMAL(10,2),
  ADD COLUMN "pack3Price" DECIMAL(10,2),
  ADD COLUMN "unitPrice" DECIMAL(10,2),
  ADD COLUMN "unitsPerCase" INTEGER;

UPDATE "product_variants"
SET "unitPrice" = "price"
WHERE "unitPrice" IS NULL;

ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_unitsPerCase_positive"
  CHECK ("unitsPerCase" IS NULL OR "unitsPerCase" > 0);

ALTER TABLE "sales"
  ADD COLUMN "currencyCode" VARCHAR(12) NOT NULL DEFAULT 'USD',
  ADD COLUMN "currencySymbol" VARCHAR(12) NOT NULL DEFAULT '$';

ALTER TABLE "proformas"
  ADD COLUMN "currencyCode" VARCHAR(12) NOT NULL DEFAULT 'USD',
  ADD COLUMN "currencySymbol" VARCHAR(12) NOT NULL DEFAULT '$';

UPDATE "sales" AS sale
SET "currencyCode" = organization."currency",
    "currencySymbol" = COALESCE(organization."currencySymbol", organization."currency")
FROM "organizations" AS organization
WHERE sale."organizationId" = organization."id";

UPDATE "proformas" AS proforma
SET "currencyCode" = organization."currency",
    "currencySymbol" = COALESCE(organization."currencySymbol", organization."currency")
FROM "organizations" AS organization
WHERE proforma."organizationId" = organization."id";

ALTER TABLE "sale_items"
  ADD COLUMN "packaging" VARCHAR(16) NOT NULL DEFAULT 'UNIT',
  ADD COLUMN "baseUnits" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "proforma_items"
  ADD COLUMN "packaging" VARCHAR(16) NOT NULL DEFAULT 'UNIT',
  ADD COLUMN "baseUnits" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_items_baseUnits_positive" CHECK ("baseUnits" > 0);

ALTER TABLE "proforma_items"
  ADD CONSTRAINT "proforma_items_baseUnits_positive" CHECK ("baseUnits" > 0);
