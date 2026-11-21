-- Scope barcode uniqueness to the owning organization without changing existing products.
-- The trigger derives organizationId from the parent product, so nested Prisma creates
-- and direct database writes cannot accidentally assign a variant to another tenant.

DROP INDEX IF EXISTS "product_variants_barcode_key";

ALTER TABLE "product_variants"
  ADD COLUMN "organizationId" TEXT;

UPDATE "product_variants" AS variant
SET "organizationId" = product."organizationId"
FROM "products" AS product
WHERE product."id" = variant."productId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "product_variants" WHERE "organizationId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Could not backfill organizationId for every product variant; migration aborted without deleting data.';
  END IF;
END $$;

ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "product_variants_organizationId_barcode_key"
  ON "product_variants" ("organizationId", "barcode");

CREATE INDEX "product_variants_organizationId_idx"
  ON "product_variants" ("organizationId");

CREATE OR REPLACE FUNCTION "set_product_variant_organization_id"()
RETURNS TRIGGER AS $$
DECLARE
  parent_organization_id TEXT;
BEGIN
  SELECT "organizationId"
    INTO parent_organization_id
    FROM "products"
    WHERE "id" = NEW."productId";

  IF parent_organization_id IS NULL THEN
    RAISE EXCEPTION 'Product variant must reference an existing product with an organization';
  END IF;

  -- Never trust a caller-supplied tenant ID; derive it from the owning product.
  NEW."organizationId" := parent_organization_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "product_variant_set_organization_id"
  BEFORE INSERT OR UPDATE OF "productId", "organizationId"
  ON "product_variants"
  FOR EACH ROW
  EXECUTE FUNCTION "set_product_variant_organization_id"();
