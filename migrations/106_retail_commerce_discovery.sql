-- Public discovery extends canonical attributes; only deliberately enabled facets are visible.
ALTER TABLE product_attributes ADD COLUMN IF NOT EXISTS online_filter INTEGER NOT NULL DEFAULT 0 CHECK(online_filter IN (0,1));
CREATE INDEX IF NOT EXISTS idx_public_product_search ON menu_items USING GIN
 (to_tsvector('simple',COALESCE(online_title,name)||' '||COALESCE(brand,'')||' '||COALESCE(online_summary,''))) WHERE online_enabled=1 AND is_available=1;
CREATE INDEX IF NOT EXISTS idx_public_variant_search ON menu_item_variants USING GIN
 (to_tsvector('simple',COALESCE(variant_name,''))) WHERE merchandising_active=1;
CREATE INDEX IF NOT EXISTS idx_public_attribute_filter ON variant_attribute_values(attribute_value_id,variant_id);
CREATE INDEX IF NOT EXISTS idx_public_product_order ON menu_items(featured DESC,online_sort,id DESC) WHERE online_enabled=1 AND is_available=1;
CREATE INDEX IF NOT EXISTS idx_online_order_queue ON retail_online_orders(status,id DESC);
