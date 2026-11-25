-- HW-04-C: additive support for weighted product variants.
-- Existing variants remain UNIT and keep their current pricing semantics.
ALTER TABLE "product_variants"
ADD COLUMN "saleUnit" TEXT NOT NULL DEFAULT 'UNIT';
