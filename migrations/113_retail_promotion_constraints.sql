-- The retail promotion editor adds repriced bundles, brands and variants to
-- the original 99 Shop promotion schema. Keep these fields in migrations
-- so a fresh PostgreSQL install works before any runtime schema helper runs.
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS quantity_price_amount DOUBLE PRECISION;
ALTER TABLE promotion_targets ADD COLUMN IF NOT EXISTS target_value TEXT;

ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_discount_value_check;
ALTER TABLE promotions ADD CONSTRAINT promotions_discount_value_check CHECK (
  CASE WHEN COALESCE(offer_type, 'discount') IN ('bundle', 'quantity_price', 'buy_x_get_y')
    THEN discount_value >= 0
    ELSE discount_value > 0
  END
);

ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_scope_check;
ALTER TABLE promotions ADD CONSTRAINT promotions_scope_check
  CHECK (scope IN ('order', 'category', 'item', 'brand', 'variant'));

ALTER TABLE promotion_targets DROP CONSTRAINT IF EXISTS promotion_targets_target_type_check;
ALTER TABLE promotion_targets ADD CONSTRAINT promotion_targets_target_type_check
  CHECK (target_type IN ('category', 'item', 'brand', 'variant', 'bundle_component'));
