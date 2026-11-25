-- PostgreSQL regression proof for organization-scoped product barcodes.
-- Runs in a transaction and leaves no test data behind.
BEGIN;

INSERT INTO "organizations" ("id", "name", "slug", "country", "updatedAt")
VALUES
  ('barcode-scope-org-a', 'Barcode Scope A', 'barcode-scope-a', 'HT', CURRENT_TIMESTAMP),
  ('barcode-scope-org-b', 'Barcode Scope B', 'barcode-scope-b', 'HT', CURRENT_TIMESTAMP);

INSERT INTO "products" ("id", "organizationId", "name", "updatedAt")
VALUES
  ('barcode-scope-product-a', 'barcode-scope-org-a', 'Barcode Scope Product A', CURRENT_TIMESTAMP),
  ('barcode-scope-product-b', 'barcode-scope-org-b', 'Barcode Scope Product B', CURRENT_TIMESTAMP);

-- The same EAN must be reusable by two independent organizations.
INSERT INTO "product_variants"
  ("id", "productId", "sku", "barcode", "price", "cost", "attributes", "updatedAt")
VALUES
  ('barcode-scope-variant-a', 'barcode-scope-product-a', 'BARCODE-SCOPE-SKU-A', '4006381333931', 1, 0, '{}', CURRENT_TIMESTAMP),
  ('barcode-scope-variant-b', 'barcode-scope-product-b', 'BARCODE-SCOPE-SKU-B', '4006381333931', 1, 0, '{}', CURRENT_TIMESTAMP);

DO $$
DECLARE
  derived_org_count integer;
  duplicate_rejected boolean := false;
BEGIN
  SELECT count(DISTINCT "organizationId")
    INTO derived_org_count
    FROM "product_variants"
    WHERE "id" IN ('barcode-scope-variant-a', 'barcode-scope-variant-b');

  IF derived_org_count <> 2 THEN
    RAISE EXCEPTION 'Barcode trigger did not derive both owning organizations';
  END IF;

  BEGIN
    INSERT INTO "product_variants"
      ("id", "productId", "sku", "barcode", "price", "cost", "attributes", "updatedAt")
    VALUES
      ('barcode-scope-variant-duplicate', 'barcode-scope-product-a',
       'BARCODE-SCOPE-SKU-DUP', '4006381333931', 1, 0, '{}', CURRENT_TIMESTAMP);
  EXCEPTION WHEN unique_violation THEN
    duplicate_rejected := true;
  END;

  IF NOT duplicate_rejected THEN
    RAISE EXCEPTION 'Duplicate barcode within one organization was accepted';
  END IF;
END $$;

ROLLBACK;
