ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS online_category_id INTEGER REFERENCES menu_categories(id);
ALTER TABLE retail_online_settings ADD COLUMN IF NOT EXISTS brand_color TEXT NOT NULL DEFAULT '#20372e';
ALTER TABLE retail_online_settings ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE retail_online_settings ADD COLUMN IF NOT EXISTS contact_text TEXT NOT NULL DEFAULT '';
ALTER TABLE retail_online_settings ADD COLUMN IF NOT EXISTS hero_text TEXT NOT NULL DEFAULT 'Thoughtfully selected essentials. A little discovery in every visit.';
ALTER TABLE retail_online_settings ADD COLUMN IF NOT EXISTS guest_enabled INTEGER NOT NULL DEFAULT 1;
