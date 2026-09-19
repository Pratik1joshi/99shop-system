-- Retail POS: products and their variants are identified at the till by a
-- scanned barcode. Nullable because not every product carries one, and
-- uniqueness is enforced only over non-null values so unbarcoded products
-- do not collide.
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS barcode TEXT;

ALTER TABLE menu_item_variants
  ADD COLUMN IF NOT EXISTS barcode TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS menu_items_barcode_key
  ON menu_items (barcode) WHERE barcode IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS menu_item_variants_barcode_key
  ON menu_item_variants (barcode) WHERE barcode IS NOT NULL;
