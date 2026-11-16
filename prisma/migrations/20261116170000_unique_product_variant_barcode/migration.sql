-- Enforce one barcode per commercial variant while allowing NULL/blank values at the DB boundary.
-- Application writes normalize blank values to NULL. Existing duplicates are never auto-deleted.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM product_variants
    WHERE barcode IS NOT NULL
    GROUP BY btrim(barcode)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate product barcodes exist. Review and resolve them before applying this migration; no rows were changed.';
  END IF;
END $$;

CREATE UNIQUE INDEX "product_variants_barcode_key"
ON "product_variants" ("barcode");
