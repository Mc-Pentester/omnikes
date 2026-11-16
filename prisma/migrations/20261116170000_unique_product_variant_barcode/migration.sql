-- Enforce one barcode per sellable variant while preserving products without barcodes.
-- If legacy duplicates exist, stop safely; never delete or rewrite business data automatically.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM product_variants
    WHERE barcode IS NOT NULL AND btrim(barcode) <> ''
    GROUP BY barcode
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate product barcodes exist. Review and resolve them before applying this migration; no rows were changed.';
  END IF;
END $$;

CREATE UNIQUE INDEX "product_variants_barcode_key"
ON "product_variants" ("barcode");
