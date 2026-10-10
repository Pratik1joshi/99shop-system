-- Phase 3.5: a maintained current moving-average cost per variant (global,
-- not per-location — see lib/retail-inventory.js). inventory_movements stays
-- the immutable historical truth (each row keeps the cost it was posted at
-- forever); this table is a transactionally-updated CACHE of "what would the
-- next sale's COGS be right now", so Phase 4 checkout and any COGS/valuation
-- read doesn't have to replay the whole movement history every time.

CREATE TABLE IF NOT EXISTS inventory_costs (
  variant_id INTEGER PRIMARY KEY REFERENCES menu_item_variants(id) ON DELETE CASCADE,
  average_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  quantity_on_hand NUMERIC(14,3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
