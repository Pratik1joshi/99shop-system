CREATE INDEX IF NOT EXISTS idx_retail_public_media ON retail_product_media(product_id,is_primary DESC,display_order,id);
CREATE INDEX IF NOT EXISTS idx_public_default_variant ON menu_item_variants(menu_item_id,is_default DESC,id) WHERE merchandising_active=1;
CREATE INDEX IF NOT EXISTS idx_public_online_category ON menu_items(COALESCE(online_category_id,category_id),featured DESC,online_sort,id DESC) WHERE online_enabled=1 AND is_available=1;
