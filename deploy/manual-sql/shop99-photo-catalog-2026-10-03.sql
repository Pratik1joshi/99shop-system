-- Catalog transcribed from "WhatsApp Image 2026-10-03 at 3.53.11 PM.jpeg".
-- PostgreSQL; run after migrations through 114_category_images.
-- Prices are in Nepalese rupees. No stock, purchase cost, barcode, or product
-- photos were supplied, so this creates catalog records and variants plus
-- category covers from public/storefront/catalog/categories/.
-- New products are available in the internal catalog but hidden from the
-- online storefront until stock and photos are added and visibility is enabled.
-- Safe to rerun: products are matched by online_slug and variants by name.
-- The crossed-out second "tote bags" line is excluded.
-- "College bag" and "college bags" are separate entries at their listed prices.
-- The two unnamed prices for Rings and Pouch are separate variants.
-- Dumpling Squishy price is cut off in the photo after "5"; 500 is a guess.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE version = '114_category_images'
  ) THEN
    RAISE EXCEPTION 'Run migrations through 114_category_images before this catalog import';
  END IF;
END $$;

CREATE TEMP TABLE photo_categories (
  name TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  image_url TEXT
) ON COMMIT DROP;

INSERT INTO photo_categories (name, description, display_order, image_url) VALUES
  ('Backpacks', 'College and everyday backpacks.', 1, '/storefront/catalog/categories/backpacks.jpeg'),
  ('Blind Boxes', 'Surprise collectibles and character gifts.', 2, '/storefront/catalog/categories/blind-boxes.jpeg'),
  ('Crochet Keychains', 'Cute keychains and bag charms.', 3, '/storefront/catalog/categories/crochet-keychains.jpeg'),
  ('Jewelry & More', 'Rings, earrings, necklaces and watches.', 4, '/storefront/catalog/categories/jewelry-and-more.jpeg'),
  ('Makeup & Pencil Cases', 'Pouches and small cases.', 5, '/storefront/catalog/categories/makeup-and-pencil-cases.jpeg'),
  ('Mini Wallets', 'Small wallets for everyday use.', 6, '/storefront/catalog/categories/mini-wallets.jpeg'),
  ('Plushies', 'Soft character toys and squishies.', 7, '/storefront/catalog/categories/plushies.jpeg'),
  ('Slippers', 'Cute and comfortable slippers.', 8, '/storefront/catalog/categories/slippers.jpeg'),
  ('Stationery', 'Pens, notes and study supplies.', 9, '/storefront/catalog/categories/stationery.jpeg'),
  ('Sunglasses & Blue Light Glasses', 'Glasses and eyewear.', 10, '/storefront/catalog/categories/blue-light-glasses.jpeg'),
  ('Tote Bags & Handbags', 'Tote bags and everyday handbags.', 11, '/storefront/catalog/categories/tote-bags-and-handbags.jpeg'),
  ('Hair Accessories', 'Hair styling tools, rollers and clips.', 20, '/storefront/catalog/categories/hair-claws-and-clips.jpg'),
  ('Fashion Accessories', 'Caps, scarves, belts and umbrellas.', 21, NULL),
  ('Beauty & Makeup', 'Lip, eye and face makeup.', 22, NULL),
  ('Phone Accessories', 'Phone cases and charger accessories.', 23, NULL),
  ('Home & Lifestyle', 'Bottles, lamps and home accessories.', 24, NULL),
  ('Gift Supplies', 'Gift wrapping supplies.', 25, NULL),
  ('Novelty Gifts', 'Novelty gifts and small toys.', 26, NULL);

INSERT INTO product_categories
  (name, description, display_order, image_url, is_active, merchandising_active, online_enabled)
SELECT name, description, display_order, image_url, 1, 1, 0
FROM photo_categories
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order,
  image_url = COALESCE(EXCLUDED.image_url, product_categories.image_url),
  is_active = 1;

-- Replace any older shop logo saved in the production site settings.
INSERT INTO site_content (content_key, content_value)
VALUES ('shop.logo', '/storefront/99-shop-by-shahana-logo.jpg')
ON CONFLICT (content_key) DO UPDATE SET
  content_value = EXCLUDED.content_value,
  updated_at = CURRENT_TIMESTAMP;

CREATE TEMP TABLE photo_products (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_name TEXT NOT NULL REFERENCES photo_categories(name),
  base_price NUMERIC(14,2) NOT NULL CHECK (base_price >= 0),
  display_order INTEGER NOT NULL,
  has_variants BOOLEAN NOT NULL DEFAULT FALSE
) ON COMMIT DROP;

INSERT INTO photo_products
  (slug, name, category_name, base_price, display_order, has_variants)
VALUES
  ('mini-hair-straightener', 'Mini Hair Straightener', 'Hair Accessories', 400, 1, FALSE),
  ('wind-chimes', 'Wind Chimes', 'Home & Lifestyle', 350, 2, FALSE),
  ('cap', 'Cap', 'Fashion Accessories', 650, 3, FALSE),
  ('sunglasses', 'Sunglasses', 'Sunglasses & Blue Light Glasses', 950, 4, FALSE),
  ('velcro-rollers', 'Velcro Rollers', 'Hair Accessories', 380, 5, FALSE),
  ('hot-bags', 'Hot Bags', 'Home & Lifestyle', 380, 6, FALSE),
  ('alarm-clock', 'Alarm Clock', 'Home & Lifestyle', 750, 7, FALSE),
  ('totoro-statue', 'Totoro Statue', 'Novelty Gifts', 1380, 8, FALSE),
  ('owala-bottle', 'Owala Bottle', 'Home & Lifestyle', 1750, 9, FALSE),
  ('scientific-calculator', 'Scientific Calculator', 'Stationery', 650, 10, FALSE),
  ('glitter-pen', 'Glitter Pen', 'Stationery', 400, 11, FALSE),
  ('tote-bags', 'Tote Bags', 'Tote Bags & Handbags', 1500, 12, FALSE),
  ('stud-earrings', 'Stud Earrings', 'Jewelry & More', 250, 13, FALSE),
  ('earrings', 'Earrings', 'Jewelry & More', 100, 14, FALSE),
  ('necklace', 'Necklace', 'Jewelry & More', 280, 15, FALSE),
  ('waterproof-charm-eyeliner', 'Waterproof Charm Eyeliner', 'Beauty & Makeup', 450, 16, FALSE),
  ('mirror-lip-gloss', 'Mirror Lip Gloss', 'Beauty & Makeup', 350, 17, FALSE),
  ('gagk-lipstick', 'GAGK Lipstick', 'Beauty & Makeup', 480, 18, FALSE),
  ('lashes', 'Lashes', 'Beauty & Makeup', 700, 19, FALSE),
  ('charger-protector', 'Charger Protector', 'Phone Accessories', 400, 20, FALSE),
  ('piggy-blind-box', 'Piggy Blind Box', 'Blind Boxes', 280, 21, FALSE),
  ('shinchan-blind-box', 'Shinchan Blind Box', 'Blind Boxes', 250, 22, FALSE),
  ('hello-kitty-bubble-gun', 'Hello Kitty Bubble Gun', 'Novelty Gifts', 550, 23, FALSE),
  ('capybara-plushie', 'Capybara Plushie', 'Plushies', 880, 24, FALSE),
  ('kitty-plushie', 'Kitty Plushie', 'Plushies', 1100, 25, TRUE),
  ('phone-cases', 'Phone Cases', 'Phone Accessories', 550, 26, FALSE),
  ('rhode-cases', 'Rhode Cases', 'Phone Accessories', 950, 27, FALSE),
  ('college-bag', 'College Bag', 'Backpacks', 2500, 28, FALSE),
  ('college-bags', 'College Bags', 'Backpacks', 2400, 29, FALSE),
  ('hair-clawchet', 'Hair Clawchet', 'Hair Accessories', 250, 30, FALSE),
  ('rings', 'Rings', 'Jewelry & More', 200, 31, TRUE),
  ('pouch', 'Pouch', 'Makeup & Pencil Cases', 480, 32, TRUE),
  ('kitty-wrapping', 'Kitty Wrapping (per piece)', 'Gift Supplies', 35, 33, FALSE),
  ('totoro-keychain', 'Totoro Keychain', 'Novelty Gifts', 250, 34, FALSE),
  ('vintage-watch', 'Vintage Watch', 'Jewelry & More', 2200, 35, FALSE),
  ('jelly-cats', 'Jelly Cats', 'Plushies', 1050, 36, FALSE),
  ('mini-wallets', 'Mini Wallets', 'Mini Wallets', 690, 37, FALSE),
  ('lip-gloss', 'Lip Gloss', 'Beauty & Makeup', 350, 38, FALSE),
  ('highlighter', 'Highlighter', 'Beauty & Makeup', 380, 39, FALSE),
  ('blush', 'Blush', 'Beauty & Makeup', 350, 40, FALSE),
  ('umbrella', 'Umbrella', 'Fashion Accessories', 800, 41, FALSE),
  ('cotton-scarf', 'Cotton Scarf', 'Fashion Accessories', 300, 42, FALSE),
  ('silk-scarf', 'Silk Scarf', 'Fashion Accessories', 350, 43, FALSE),
  ('vintage-y2k-belt', 'Vintage Y2K Belt', 'Fashion Accessories', 1500, 44, FALSE),
  ('lip-liners', 'Lip Liners', 'Beauty & Makeup', 100, 45, FALSE),
  ('moomin-plush', 'Moomin Plush', 'Plushies', 1200, 46, FALSE),
  ('water-bottles', 'Water Bottles', 'Home & Lifestyle', 1200, 47, FALSE),
  ('dumpling-squishy', 'Dumpling Squishy', 'Plushies', 500, 48, FALSE),
  ('study-lamp', 'Study Lamp', 'Home & Lifestyle', 950, 49, FALSE),
  ('side-clips', 'Side Clips', 'Hair Accessories', 100, 50, FALSE),
  ('sticky-notes', 'Sticky Notes', 'Stationery', 100, 51, FALSE);

-- Refuse to reuse a slug that belongs to a differently named product.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM photo_products s
    JOIN products p ON p.online_slug = s.slug
    WHERE p.name <> s.name
  ) THEN
    RAISE EXCEPTION 'A catalog slug already belongs to a different product';
  END IF;
END $$;

INSERT INTO products
  (name, category_id, base_price, unit, is_available, stock_usage,
   display_order, online_title, online_slug, online_enabled,
   merchandising_type)
SELECT s.name, c.id, s.base_price, 'pcs', 1, 1,
       s.display_order, s.name, s.slug, 0,
       CASE WHEN s.has_variants THEN 'variant' ELSE 'simple' END
FROM photo_products s
JOIN product_categories c ON c.name = s.category_name
ON CONFLICT (online_slug) WHERE online_slug IS NOT NULL DO UPDATE SET
  name = EXCLUDED.name,
  category_id = EXCLUDED.category_id,
  base_price = EXCLUDED.base_price,
  unit = EXCLUDED.unit,
  display_order = EXCLUDED.display_order,
  online_title = EXCLUDED.online_title,
  merchandising_type = EXCLUDED.merchandising_type,
  updated_at = CURRENT_TIMESTAMP;

CREATE TEMP TABLE photo_variants (
  slug TEXT NOT NULL REFERENCES photo_products(slug),
  variant_name TEXT NOT NULL,
  price NUMERIC(14,2) NOT NULL CHECK (price >= 0),
  is_default INTEGER NOT NULL CHECK (is_default IN (0, 1)),
  PRIMARY KEY (slug, variant_name)
) ON COMMIT DROP;

INSERT INTO photo_variants (slug, variant_name, price, is_default)
SELECT slug, 'Standard', base_price, 1
FROM photo_products WHERE NOT has_variants;

INSERT INTO photo_variants (slug, variant_name, price, is_default) VALUES
  ('kitty-plushie', 'S', 1100, 1),
  ('kitty-plushie', 'M', 1300, 0),
  ('kitty-plushie', 'L', 2800, 0),
  ('rings', 'Rs 200 option', 200, 1),
  ('rings', 'Rs 250 option', 250, 0),
  ('pouch', 'Rs 480 option', 480, 1),
  ('pouch', 'Rs 1150 option', 1150, 0);

-- Update previously imported variants, then insert only missing variants.
UPDATE product_variants v SET
  price = s.price,
  price_modifier = 0,
  is_default = s.is_default,
  merchandising_active = 1
FROM photo_variants s
JOIN products p ON p.online_slug = s.slug
WHERE v.product_id = p.id AND v.variant_name = s.variant_name;

INSERT INTO product_variants
  (product_id, variant_name, price, price_modifier, is_default,
   tracking_mode, merchandising_active)
SELECT p.id, s.variant_name, s.price, 0, s.is_default, 'none', 1
FROM photo_variants s
JOIN products p ON p.online_slug = s.slug
WHERE NOT EXISTS (
  SELECT 1 FROM product_variants v
  WHERE v.product_id = p.id AND v.variant_name = s.variant_name
);

COMMIT;
