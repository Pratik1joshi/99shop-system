-- Categories get their own picture for the online store and admin lists.
-- Empty means the storefront keeps falling back to a product photo.
ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS image_url TEXT;
