-- Products and categories used to start switched off for the online shop, and
-- the switch sat on a separate page, so most items showed "Ask about this item"
-- on the website. New rows now start on, and everything currently for sale is
-- switched on once. "Sell online" on a product (or "Show in the online store"
-- on a category) still turns it off.
ALTER TABLE menu_items ALTER COLUMN online_enabled SET DEFAULT 1;
ALTER TABLE menu_categories ALTER COLUMN online_enabled SET DEFAULT 1;
UPDATE menu_items SET online_enabled = 1 WHERE online_enabled = 0 AND is_available = 1 AND COALESCE(is_combo, 0) = 0;
UPDATE menu_categories SET online_enabled = 1 WHERE online_enabled = 0 AND is_active = 1;
