-- Extend the canonical catalog; no duplicate product or inventory ledger.
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS merchandising_type TEXT NOT NULL DEFAULT 'simple';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS online_title TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS online_description TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS online_summary TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS online_slug TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS online_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS featured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS online_sort INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_online_slug ON menu_items(online_slug) WHERE online_slug IS NOT NULL;
ALTER TABLE menu_item_variants ADD COLUMN IF NOT EXISTS merchandising_signature TEXT;
ALTER TABLE menu_item_variants ADD COLUMN IF NOT EXISTS purchase_cost NUMERIC(14,2);
ALTER TABLE menu_item_variants ADD COLUMN IF NOT EXISTS wholesale_min_quantity NUMERIC(14,3) NOT NULL DEFAULT 1;
ALTER TABLE menu_item_variants ADD COLUMN IF NOT EXISTS merchandising_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE menu_item_variants ADD COLUMN IF NOT EXISTS weight NUMERIC(14,3);
CREATE UNIQUE INDEX IF NOT EXISTS idx_variant_merchandising_signature ON menu_item_variants(menu_item_id,merchandising_signature) WHERE merchandising_signature IS NOT NULL;
ALTER TABLE product_attribute_values ADD COLUMN IF NOT EXISTS short_code TEXT;
ALTER TABLE product_attribute_values ADD COLUMN IF NOT EXISTS swatch TEXT;
ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS merchandising_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS online_enabled INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS retail_brands (
 id SERIAL PRIMARY KEY,name TEXT NOT NULL UNIQUE,active INTEGER NOT NULL DEFAULT 1,description TEXT,logo_url TEXT
);
CREATE TABLE IF NOT EXISTS retail_product_media (
 id SERIAL PRIMARY KEY,product_id INTEGER NOT NULL REFERENCES menu_items(id),variant_id INTEGER REFERENCES menu_item_variants(id),
 url TEXT NOT NULL,alt TEXT NOT NULL DEFAULT '',display_order INTEGER NOT NULL DEFAULT 0,is_primary INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS retail_supplier_skus (
 id SERIAL PRIMARY KEY,variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id),supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
 supplier_sku TEXT,supplier_barcode TEXT,minimum_order_quantity NUMERIC(14,3),preferred INTEGER NOT NULL DEFAULT 0,
 UNIQUE(variant_id,supplier_id)
);
CREATE TABLE IF NOT EXISTS retail_customer_groups (
 id SERIAL PRIMARY KEY,name TEXT NOT NULL UNIQUE,code TEXT NOT NULL UNIQUE,pricing_mode TEXT NOT NULL DEFAULT 'retail',active INTEGER NOT NULL DEFAULT 1
);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS commercial_group_id INTEGER REFERENCES retail_customer_groups(id);
CREATE TABLE IF NOT EXISTS retail_price_lists (
 id SERIAL PRIMARY KEY,name TEXT NOT NULL,code TEXT NOT NULL UNIQUE,active INTEGER NOT NULL DEFAULT 1,
 channel TEXT,customer_group_id INTEGER REFERENCES retail_customer_groups(id),priority INTEGER NOT NULL DEFAULT 0,
 starts_at TIMESTAMPTZ,ends_at TIMESTAMPTZ,created_by INTEGER REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(channel IS NULL OR channel IN ('retail_pos','online')),
 CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at>starts_at)
);
CREATE TABLE IF NOT EXISTS retail_price_list_items (
 id SERIAL PRIMARY KEY,price_list_id INTEGER NOT NULL REFERENCES retail_price_lists(id),
 product_id INTEGER REFERENCES menu_items(id),variant_id INTEGER REFERENCES menu_item_variants(id),
 min_quantity NUMERIC(14,3) NOT NULL DEFAULT 1,fixed_price NUMERIC(14,2),adjustment_percent NUMERIC(10,4),
 CHECK(min_quantity>0),CHECK(fixed_price IS NULL OR fixed_price>=0),
 CHECK((product_id IS NULL)<>(variant_id IS NULL)),
 CHECK((fixed_price IS NULL)<>(adjustment_percent IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_price_items_variant ON retail_price_list_items(variant_id,price_list_id);
CREATE INDEX IF NOT EXISTS idx_price_items_product ON retail_price_list_items(product_id,price_list_id);
CREATE TABLE IF NOT EXISTS retail_price_audit (
 id SERIAL PRIMARY KEY,action TEXT NOT NULL,actor_id INTEGER REFERENCES users(id),source_id INTEGER,
 before_json TEXT,after_json TEXT,reason TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS retail_catalog_jobs (
 id SERIAL PRIMARY KEY,kind TEXT NOT NULL,created_by INTEGER NOT NULL REFERENCES users(id),payload_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PREVIEW',result_json TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,applied_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS retail_margin_policy (
 id INTEGER PRIMARY KEY CHECK(id=1),mode TEXT NOT NULL DEFAULT 'off',minimum_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
 CHECK(mode IN ('off','warn','manager')),CHECK(minimum_percent>=0 AND minimum_percent<=100)
);
INSERT INTO retail_margin_policy(id) VALUES (1) ON CONFLICT(id) DO NOTHING;
ALTER TABLE retail_sale_lines ADD COLUMN IF NOT EXISTS price_explanation_json TEXT;
