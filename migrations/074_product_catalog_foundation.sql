-- Retail product catalog foundation: multi-barcode support, a flexible
-- attribute system (color/size/shade/... without fixed columns), and the
-- per-variant commercial fields (SKU, MRP, wholesale price, tax category,
-- reorder quantity) a retail SKU needs that the 99 Shop menu item never
-- did. Additive only — menu_items/menu_item_variants.barcode stay as the
-- primary code so nothing that already reads them breaks; this is a second,
-- optional namespace for extra codes per variant.

CREATE TABLE IF NOT EXISTS product_barcodes (
  id SERIAL PRIMARY KEY,
  menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
  variant_id INTEGER REFERENCES menu_item_variants(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  barcode_type TEXT NOT NULL DEFAULT 'primary'
    CHECK (barcode_type IN ('primary', 'manufacturer', 'internal', 'supplier', 'other')),
  is_primary INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  CHECK (
    (menu_item_id IS NOT NULL AND variant_id IS NULL) OR
    (menu_item_id IS NULL AND variant_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_barcodes_code_unique ON product_barcodes(barcode);
CREATE INDEX IF NOT EXISTS idx_product_barcodes_menu_item ON product_barcodes(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_product_barcodes_variant ON product_barcodes(variant_id);

-- Carry every existing barcode forward so the new table is a superset from day one.
INSERT INTO product_barcodes (menu_item_id, barcode, barcode_type, is_primary)
SELECT id, barcode, 'primary', 1 FROM menu_items
WHERE barcode IS NOT NULL AND barcode <> ''
ON CONFLICT (barcode) DO NOTHING;

INSERT INTO product_barcodes (variant_id, barcode, barcode_type, is_primary)
SELECT id, barcode, 'primary', 1 FROM menu_item_variants
WHERE barcode IS NOT NULL AND barcode <> ''
ON CONFLICT (barcode) DO NOTHING;

CREATE TABLE IF NOT EXISTS product_attributes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);

CREATE TABLE IF NOT EXISTS product_attribute_values (
  id SERIAL PRIMARY KEY,
  attribute_id INTEGER NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  UNIQUE(attribute_id, value)
);

CREATE TABLE IF NOT EXISTS variant_attribute_values (
  id SERIAL PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id) ON DELETE CASCADE,
  attribute_id INTEGER NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
  attribute_value_id INTEGER NOT NULL REFERENCES product_attribute_values(id) ON DELETE CASCADE,
  UNIQUE(variant_id, attribute_id)
);
CREATE INDEX IF NOT EXISTS idx_variant_attribute_values_variant ON variant_attribute_values(variant_id);

ALTER TABLE menu_item_variants ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE menu_item_variants ADD COLUMN IF NOT EXISTS mrp NUMERIC(14,2);
ALTER TABLE menu_item_variants ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(14,2);
ALTER TABLE menu_item_variants ADD COLUMN IF NOT EXISTS tax_category TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_item_variants_sku_unique
  ON menu_item_variants(sku) WHERE sku IS NOT NULL AND sku <> '';

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS brand TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_items_sku_unique
  ON menu_items(sku) WHERE sku IS NOT NULL AND sku <> '';
CREATE INDEX IF NOT EXISTS idx_menu_items_brand ON menu_items(brand) WHERE brand IS NOT NULL;

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS reorder_quantity DOUBLE PRECISION DEFAULT 0;
