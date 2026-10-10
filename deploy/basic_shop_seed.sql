-- 99 Shop by Shahana: basic catalog and storefront seed for PostgreSQL.
-- Run once AFTER every numbered migration and AFTER npm run db:seed.
-- Safe to rerun: existing products, variants, media, and CMS edits are kept.
-- Stock is deliberately not seeded. Receive or count real stock in the app
-- before accepting online orders; SQL inserts would bypass inventory costing.
-- This file does not create an admin password or sample sales/customers.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE version = '114_category_images'
  ) THEN
    RAISE EXCEPTION 'Run npm run db:migrate before basic_shop_seed.sql';
  END IF;
END $$;

INSERT INTO menu_categories
  (name, description, display_order, image_url, is_active, merchandising_active, online_enabled)
VALUES
  ('Hair Clips', 'Claw clips, cloud clips and bows.', 1,
   '/storefront/hair-claws-and-clips.jpg', 1, 1, 1)
ON CONFLICT (name) DO NOTHING;

INSERT INTO menu_items
  (name, description, category_id, base_price, image_url, is_available,
   merchandising_type, online_slug, online_summary, online_description,
   online_enabled, featured, online_sort)
SELECT 'Berry Cloud Claw Clip',
       'Pink leopard-berry print on a soft cloud shape.', c.id, 99,
       '/storefront/berry-cloud-claw-clip.jpg', 1,
       'simple', 'berry-cloud-claw-clip',
       'Pink leopard-berry print on a soft cloud shape.',
       'Pink leopard-berry print on a soft cloud shape.', 1, 1, 1
FROM menu_categories c WHERE c.name = 'Hair Clips'
ON CONFLICT (online_slug) WHERE online_slug IS NOT NULL DO NOTHING;

INSERT INTO menu_items
  (name, description, category_id, base_price, image_url, is_available,
   merchandising_type, online_slug, online_summary, online_description,
   online_enabled, featured, online_sort)
SELECT 'Clips', 'Hair clips in assorted colours and sizes.', c.id, 100,
       '/storefront/hair-claws-and-clips.jpg', 1,
       'simple', 'clips', 'Hair clips in assorted colours and sizes.',
       'Hair clips in assorted colours and sizes.', 1, 1, 2
FROM menu_categories c WHERE c.name = 'Hair Clips'
ON CONFLICT (online_slug) WHERE online_slug IS NOT NULL DO NOTHING;

WITH seed_variants(product_slug, variant_name, price, is_default, barcode) AS (
  VALUES
  ('berry-cloud-claw-clip', 'Standard', 99, 1, 'INT-ADD09AF5D7386EC8E0DD'),
  ('berry-cloud-claw-clip', 'Pink / S', 99, 0, 'INT-1ECE2AA31F684D83AAAC'),
  ('berry-cloud-claw-clip', 'Pink / M', 99, 0, 'INT-9EB1A9719B6C499BB3B5'),
  ('berry-cloud-claw-clip', 'Pink / L', 99, 0, 'INT-A7A5B85CD1A04EB4B717'),
  ('berry-cloud-claw-clip', 'Green / S', 99, 0, 'INT-6A7C8193D568401DB729'),
  ('berry-cloud-claw-clip', 'Green / M', 99, 0, 'INT-861B9CB6BA5C46CBA9CA'),
  ('berry-cloud-claw-clip', 'Green / L', 99, 0, 'INT-23C3E7FEBC9F43CBB2EB'),
  ('berry-cloud-claw-clip', 'White / S', 99, 0, 'INT-0E48AC62364E413FB813'),
  ('berry-cloud-claw-clip', 'White / M', 99, 0, 'INT-3DE2009B198E4D9CAA4B'),
  ('berry-cloud-claw-clip', 'White / L', 99, 0, 'INT-DE2DF1BB4E2F407CB887'),
  ('berry-cloud-claw-clip', 'Blue / S', 99, 0, 'INT-734B09DA8DEF432E91D2'),
  ('berry-cloud-claw-clip', 'Blue / M', 99, 0, 'INT-0EFCFE02B420422C9A6C'),
  ('berry-cloud-claw-clip', 'Blue / L', 99, 0, 'INT-2D5CB26B27EE4D7492B2'),
  ('berry-cloud-claw-clip', 'Black / S', 99, 0, 'INT-2BB955E2C9BA4BF49B35'),
  ('berry-cloud-claw-clip', 'Black / M', 99, 0, 'INT-88CF85F577EE478096FE'),
  ('berry-cloud-claw-clip', 'Black / L', 99, 0, 'INT-1584558184E94D6BAA82'),
  ('berry-cloud-claw-clip', 'Purple / S', 99, 0, 'INT-251A0B93100748B3B884'),
  ('berry-cloud-claw-clip', 'Purple / M', 99, 0, 'INT-620897D56B0D4037814E'),
  ('berry-cloud-claw-clip', 'Purple / L', 99, 0, 'INT-A79D7DBBD4C24E0098B5'),
  ('clips', 'Standard', 100, 1, 'INT-7D448EEBA578BBBB1EC4'),
  ('clips', 'Pink / L', 100, 0, 'INT-816E38E4F7884A838E3F'),
  ('clips', 'Pink / M', 100, 0, 'INT-A8DB74B028474419A90C'),
  ('clips', 'Pink / S', 100, 0, 'INT-29BA7751BE734E56A53E'),
  ('clips', 'Red / L', 100, 0, 'INT-B12103313DBC4BA79EEB'),
  ('clips', 'Red / M', 100, 0, 'INT-DC0FA61BB5104AB6A415'),
  ('clips', 'Red / S', 100, 0, 'INT-E62F893EAF6844C4A723'),
  ('clips', 'White / L', 100, 0, 'INT-8612D911EB70483B8C37'),
  ('clips', 'White / M', 100, 0, 'INT-A5AFF656B4D7460CA434'),
  ('clips', 'White / S', 100, 0, 'INT-93B007DB94D943CC8EED'),
  ('clips', 'Blue / L', 100, 0, 'INT-03EE46CDF45542FEA193'),
  ('clips', 'Blue / M', 100, 0, 'INT-94D5B0C885194E0B9692'),
  ('clips', 'Blue / S', 100, 0, 'INT-8474BDA1719C49C8A820'),
  ('clips', 'Green / L', 100, 0, 'INT-20BF1F24154A4BB980B7'),
  ('clips', 'Green / M', 100, 0, 'INT-48E726B8C8EE4BF09ED6'),
  ('clips', 'Green / S', 100, 0, 'INT-8707063DF794448493E8'),
  ('clips', 'Purple / L', 100, 0, 'INT-B5F953669E514F20893C'),
  ('clips', 'Purple / M', 100, 0, 'INT-FBFAFCD7961941F682D4'),
  ('clips', 'Purple / S', 100, 0, 'INT-AE653B0195D34D0995EA'),
  ('clips', 'Black / L', 100, 0, 'INT-266F95542186467CA5B8'),
  ('clips', 'Black / M', 100, 0, 'INT-B039D90FE8D74675BC2A'),
  ('clips', 'Black / S', 100, 0, 'INT-85208F1C29BC4F2DB1A5')
)
INSERT INTO menu_item_variants
  (menu_item_id, variant_name, price_modifier, is_default, price, barcode,
   tracking_mode, merchandising_active)
SELECT p.id, s.variant_name, 0, s.is_default, s.price, s.barcode,
       'none', 1
FROM seed_variants s JOIN menu_items p ON p.online_slug = s.product_slug
ON CONFLICT (barcode) WHERE barcode IS NOT NULL DO NOTHING;

INSERT INTO product_barcodes (variant_id, barcode, barcode_type, is_primary)
SELECT v.id, v.barcode, 'primary', 1
FROM menu_item_variants v JOIN menu_items p ON p.id = v.menu_item_id
WHERE p.online_slug IN ('berry-cloud-claw-clip', 'clips')
  AND v.barcode IS NOT NULL
ON CONFLICT (barcode) DO NOTHING;

INSERT INTO retail_product_media
  (product_id, url, alt, display_order, is_primary)
SELECT p.id, image.url, p.name, 0, 1
FROM (VALUES
  ('berry-cloud-claw-clip', '/storefront/berry-cloud-claw-clip.jpg'),
  ('clips', '/storefront/hair-claws-and-clips.jpg')
) AS image(slug, url)
JOIN menu_items p ON p.online_slug = image.slug
WHERE NOT EXISTS (
  SELECT 1 FROM retail_product_media existing
  WHERE existing.product_id = p.id AND existing.url = image.url
);

-- Apply the shipped online defaults only to a new, unconfigured store.
UPDATE retail_online_settings
SET enabled = 1, store_name = '99 Shop by Shahana',
    guest_enabled = 1, brand_color = '#D6316F'
WHERE id = 1 AND store_name = 'Aadhar Store';

INSERT INTO site_content (content_key, content_value)
VALUES
  ('shop.intro', 'Discover our hair clips and place an order online for store collection.'),
  ('home.cta_primary', 'Shop online'),
  ('seo.home_description', 'Shop hair clips online from 99 Shop by Shahana in Surkhet. Browse products and place an order for store collection.'),
  ('contact.delivery_note', 'Order online for store collection. Delivery will appear at checkout if the shop enables it.'),
  ('steps.one_body', 'Browse the shop and choose the items you love.'),
  ('steps.two_title', 'Add to your bag'),
  ('steps.two_body', 'Choose your options and quantity, then review your bag.'),
  ('steps.three_title', 'Place your order'),
  ('steps.three_body', 'Enter your name and phone number at checkout. No account is needed.')
ON CONFLICT (content_key) DO NOTHING;

COMMIT;
