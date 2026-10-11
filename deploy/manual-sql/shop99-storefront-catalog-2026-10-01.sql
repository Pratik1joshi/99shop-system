-- 99 Shop by Shahana: initial production storefront catalog.
-- Apply after migrations/001_retail_schema.sql, db:seed, basic_shop_seed.sql, and
-- copying public/storefront/catalog/.
-- Prices are Rs 99 and opening stock is 10 units per variant, as requested.
-- Opening stock has zero cost because no purchase costs were supplied. Record
-- actual costs through the normal purchasing workflow before valuing stock.
-- Safe to rerun: existing stock balances and their movement history are kept.

BEGIN;

CREATE TEMP TABLE shop99_seed_categories (
  name TEXT PRIMARY KEY, description TEXT, display_order INTEGER, image_url TEXT
) ON COMMIT DROP;
INSERT INTO shop99_seed_categories VALUES
  ('Hair Clips', 'Claw clips, cloud clips and bows.', 1, '/storefront/catalog/categories/hair-claws-and-clips.jpg'),
  ('Cherry', 'The glossy cherry range.', 2, '/storefront/catalog/categories/cherry-charms.jpg');

INSERT INTO product_categories (name, description, display_order, image_url, is_active, online_enabled, merchandising_active)
SELECT name, description, display_order, image_url, 1, 1, 1 FROM shop99_seed_categories
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order,
  image_url = EXCLUDED.image_url,
  is_active = 1,
  online_enabled = 1,
  merchandising_active = 1;

CREATE TEMP TABLE shop99_seed_products (
  barcode TEXT PRIMARY KEY, name TEXT, category_name TEXT, description TEXT,
  slug TEXT, image_url TEXT, display_order INTEGER, opening_quantity NUMERIC(14,3)
) ON COMMIT DROP;
INSERT INTO shop99_seed_products VALUES
  ('990001', 'Berry Cloud Claw Clip', 'Hair Clips', 'Pink leopard-berry print on a soft cloud shape.', 'berry-cloud-claw-clip', '/storefront/catalog/products/hair-clips/berry-cloud-claw-clip.jpg', 1, 10),
  ('990002', 'Petal Cloud Claw Clip', 'Hair Clips', 'Ivory cloud claw scattered with tiny pink petals.', 'petal-cloud-claw-clip', '/storefront/catalog/products/hair-clips/petal-cloud-claw-clip.jpg', 2, 10),
  ('990003', 'Sky Gingham Cloud Claw Clip', 'Hair Clips', 'Blue gingham cloud claw with a lace trim and bow.', 'sky-gingham-cloud-claw-clip', '/storefront/catalog/products/hair-clips/sky-gingham-cloud-claw-clip.jpg', 3, 10),
  ('990004', 'Blush Gingham Triangle Claw Clip', 'Hair Clips', 'Pink checks, blue trim, one neat little bow.', 'blush-gingham-triangle-claw-clip', '/storefront/catalog/products/hair-clips/blush-gingham-triangle-claw-clip.jpg', 4, 10),
  ('990005', 'Heart Crown Claw Clip', 'Hair Clips', 'Baby-blue gingham double hearts, joined at the crown.', 'heart-crown-claw-clip', '/storefront/catalog/products/hair-clips/heart-crown-claw-clip.jpg', 5, 10),
  ('990006', 'Ivory Bow Claw Clip', 'Hair Clips', 'Cream base, tiny florals and a hand-tied bow detail.', 'ivory-bow-claw-clip', '/storefront/catalog/products/hair-clips/ivory-bow-claw-clip.jpg', 6, 10),
  ('990009', 'Cherry Bag Charm', 'Cherry', 'Glossy cherry duo styled to clip onto a bag.', 'cherry-bag-charm', '/storefront/catalog/products/cherry/cherry-bag-charm.jpg', 7, 10);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM inventory_locations WHERE is_default = 1 AND is_active = 1 AND is_sellable = 1) THEN
    RAISE EXCEPTION 'A sellable default inventory location is required before seeding opening stock';
  END IF;
  IF EXISTS (
    SELECT 1 FROM shop99_seed_products s JOIN products p ON p.online_slug = s.slug
    WHERE p.barcode IS NOT NULL AND p.barcode <> s.barcode
  ) THEN
    RAISE EXCEPTION 'A seeded online slug belongs to a different product; resolve it before applying this file';
  END IF;
  IF EXISTS (
    SELECT 1 FROM shop99_seed_products s JOIN products p ON p.barcode = s.barcode
    WHERE p.online_slug IS DISTINCT FROM s.slug
  ) THEN
    RAISE EXCEPTION 'A seeded barcode belongs to a different product; resolve it before applying this file';
  END IF;
END $$;

-- Reuse products already created by basic_shop_seed.sql, which had no
-- product-level barcode, before the barcode-based upsert below.
UPDATE products p SET barcode = s.barcode
FROM shop99_seed_products s
WHERE p.online_slug = s.slug AND p.barcode IS NULL;

INSERT INTO products (
  name, description, category_id, base_price, image_url, barcode, unit,
  is_available, stock_usage, display_order, online_title, online_summary,
  online_description, online_slug, online_enabled, featured, merchandising_type
)
SELECT s.name, s.description, c.id, 99, s.image_url, s.barcode, 'pcs',
  1, 1, s.display_order, s.name, s.description, s.description, s.slug, 1,
  CASE WHEN s.display_order <= 2 THEN 1 ELSE 0 END, 'simple'
FROM shop99_seed_products s JOIN product_categories c ON c.name = s.category_name
ON CONFLICT (barcode) WHERE barcode IS NOT NULL DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category_id = EXCLUDED.category_id,
  base_price = EXCLUDED.base_price,
  image_url = EXCLUDED.image_url,
  unit = EXCLUDED.unit,
  is_available = 1,
  display_order = EXCLUDED.display_order,
  online_title = EXCLUDED.online_title,
  online_summary = EXCLUDED.online_summary,
  online_description = EXCLUDED.online_description,
  online_slug = EXCLUDED.online_slug,
  online_enabled = 1,
  featured = EXCLUDED.featured,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO product_barcodes (product_id, barcode, barcode_type, is_primary)
SELECT p.id, s.barcode, 'primary', 1
FROM products p JOIN shop99_seed_products s ON s.barcode = p.barcode
ON CONFLICT (barcode) DO NOTHING;

-- Keep existing size/colour variants. Add Standard only when a product has no variants.
INSERT INTO product_variants (product_id, variant_name, price_modifier, is_default, price, mrp, tracking_mode, merchandising_active)
SELECT p.id, 'Standard', 0, 1, 99, 99, 'none', 1
FROM products p JOIN shop99_seed_products s ON s.barcode = p.barcode
WHERE NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id);

UPDATE product_variants v SET price = 99, mrp = 99, merchandising_active = 1
FROM products p JOIN shop99_seed_products s ON s.barcode = p.barcode
WHERE v.product_id = p.id;

-- Public product gallery, with the exact same paths used by the category cards.
INSERT INTO retail_product_media (product_id, variant_id, url, alt, display_order, is_primary)
SELECT p.id, NULL, s.image_url, s.name, 0,
  CASE WHEN EXISTS (SELECT 1 FROM retail_product_media old WHERE old.product_id = p.id AND old.is_primary = 1) THEN 0 ELSE 1 END
FROM products p JOIN shop99_seed_products s ON s.barcode = p.barcode
WHERE NOT EXISTS (SELECT 1 FROM retail_product_media old WHERE old.product_id = p.id AND old.url = s.image_url);

-- Only newly unstocked variant/location pairs receive opening stock.
CREATE TEMP TABLE shop99_opening_rows (
  variant_id INTEGER, location_id INTEGER, quantity NUMERIC(14,3)
) ON COMMIT DROP;
WITH inserted AS (
  INSERT INTO inventory_balances (variant_id, location_id, batch_id, quantity_on_hand)
  SELECT v.id, loc.id, NULL, s.opening_quantity
  FROM shop99_seed_products s
  JOIN products p ON p.barcode = s.barcode
  JOIN product_variants v ON v.product_id = p.id
  JOIN inventory_locations loc ON loc.is_default = 1 AND loc.is_active = 1 AND loc.is_sellable = 1
  WHERE v.tracking_mode = 'none'
  ON CONFLICT (variant_id, location_id) WHERE batch_id IS NULL DO NOTHING
  RETURNING variant_id, location_id, quantity_on_hand
)
INSERT INTO shop99_opening_rows SELECT variant_id, location_id, quantity_on_hand FROM inserted;

INSERT INTO inventory_movements (
  variant_id, location_id, batch_id, movement_type, quantity, balance_after,
  unit_cost, total_cost, carrying_value_delta, reference_type, reason
)
SELECT variant_id, location_id, NULL, 'OPENING_STOCK', quantity, quantity,
  0, 0, 0, 'SHOP99_CATALOG_SEED', 'Opening stock supplied for storefront seed'
FROM shop99_opening_rows;

INSERT INTO inventory_costs (variant_id, average_cost, quantity_on_hand, carrying_value)
SELECT variant_id, 0, SUM(quantity), 0 FROM shop99_opening_rows GROUP BY variant_id
ON CONFLICT (variant_id) DO UPDATE SET
  quantity_on_hand = inventory_costs.quantity_on_hand + EXCLUDED.quantity_on_hand,
  average_cost = CASE WHEN inventory_costs.quantity_on_hand + EXCLUDED.quantity_on_hand > 0
    THEN inventory_costs.carrying_value / (inventory_costs.quantity_on_hand + EXCLUDED.quantity_on_hand)
    ELSE 0 END,
  updated_at = CURRENT_TIMESTAMP;

COMMIT;
