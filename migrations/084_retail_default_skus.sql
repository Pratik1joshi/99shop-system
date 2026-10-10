-- Retail transactions are variant/SKU keyed, while the restaurant catalog
-- allowed products with no variant row. Give every ordinary product one
-- stable default SKU so it can be sold, received, counted, and transferred.
-- These compatibility columns previously existed only through the runtime
-- ensureMenuVariantsSchema() path. A clean PostgreSQL migration must create
-- them before the default-SKU backfill below can run.
ALTER TABLE menu_item_variants ADD COLUMN IF NOT EXISTS price DOUBLE PRECISION;
ALTER TABLE menu_item_variants ADD COLUMN IF NOT EXISTS stock_quantity DOUBLE PRECISION;
ALTER TABLE menu_item_variants ADD COLUMN IF NOT EXISTS stock_unit TEXT;
ALTER TABLE menu_item_variants ADD COLUMN IF NOT EXISTS inventory_item_id INTEGER;
ALTER TABLE menu_item_variants ADD COLUMN IF NOT EXISTS pos_stock_visible INTEGER DEFAULT 0;

INSERT INTO menu_item_variants
  (menu_item_id, variant_name, price_modifier, is_default, price, stock_unit, pos_stock_visible, barcode)
SELECT mi.id, 'Standard', 0, 1, mi.base_price, mi.unit, 0, NULL
  FROM menu_items mi
 WHERE COALESCE(mi.is_combo, 0) = 0
   AND NOT EXISTS (
     SELECT 1 FROM menu_item_variants v WHERE v.menu_item_id = mi.id
   );
