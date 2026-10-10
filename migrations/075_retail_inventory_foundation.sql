-- Retail inventory foundation: locations, batches, a variant+location+batch
-- stock balance, and a movement ledger with the full retail vocabulary
-- (opening stock, transfers, damage, expiry, tester/sample/internal use...).
--
-- This is a NEW, additive system that sits alongside the existing
-- inventory_items / stock_movements / applyStockChange() ledger — it does
-- NOT replace it. Today's POS sale deduction (lib/stock.js) keeps reading
-- and writing inventory_items exactly as before; nothing here changes that
-- path or touches its data. See lib/retail-inventory.js for why, and for
-- the plan to wire batch/location-aware sale deduction in a later phase.

CREATE TABLE IF NOT EXISTS inventory_locations (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  name TEXT NOT NULL,
  code TEXT,
  location_type TEXT NOT NULL DEFAULT 'shop'
    CHECK (location_type IN ('shop', 'warehouse', 'display', 'damaged', 'returns', 'other')),
  is_default INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_locations_code_unique
  ON inventory_locations(code) WHERE code IS NOT NULL AND code <> '';
-- At most one default location system-wide (the implicit home for today's single shop).
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_locations_one_default
  ON inventory_locations((1)) WHERE is_default = 1;

INSERT INTO inventory_locations (name, code, location_type, is_default, is_active)
SELECT 'Main Store', 'MAIN', 'shop', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM inventory_locations WHERE is_default = 1);

-- How a variant's stock is tracked. NONE = one number, no batches (most
-- accessories). BATCH = expiry/lot-tracked (cosmetics). SERIAL is schema-
-- ready (variant_attribute_values / a future serial table can key off the
-- variant) but has no dedicated workflow yet.
ALTER TABLE menu_item_variants ADD COLUMN IF NOT EXISTS tracking_mode TEXT NOT NULL DEFAULT 'none';
ALTER TABLE menu_item_variants ADD COLUMN IF NOT EXISTS reorder_point NUMERIC(14,2);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menu_item_variants_tracking_mode_check') THEN
    ALTER TABLE menu_item_variants
      ADD CONSTRAINT menu_item_variants_tracking_mode_check
      CHECK (tracking_mode IN ('none', 'batch', 'serial'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS inventory_batches (
  id SERIAL PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  manufactured_date DATE,
  expiry_date DATE,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_id INTEGER REFERENCES purchases(id) ON DELETE SET NULL,
  unit_cost NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'written_off', 'depleted')),
  received_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  -- Scoped per variant, not global: two different products can each have a
  -- batch numbered "L2024-01" without colliding.
  UNIQUE(variant_id, batch_number)
);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_variant ON inventory_batches(variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_expiry ON inventory_batches(expiry_date) WHERE expiry_date IS NOT NULL;

-- Cache/current-state table. The movement ledger below is the audit trail;
-- this is only ever mutated by the inventory service alongside a movement
-- row in the same transaction, never edited directly.
CREATE TABLE IF NOT EXISTS inventory_balances (
  id SERIAL PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
  batch_id INTEGER REFERENCES inventory_batches(id) ON DELETE RESTRICT,
  quantity_on_hand NUMERIC(14,3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
-- Postgres/SQLite both treat NULL as distinct in a unique index, so the
-- batch-less (tracking_mode = 'none') balance row needs its own partial index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_balances_with_batch
  ON inventory_balances(variant_id, location_id, batch_id) WHERE batch_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_balances_no_batch
  ON inventory_balances(variant_id, location_id) WHERE batch_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_balances_variant ON inventory_balances(variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_balances_location ON inventory_balances(location_id);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id SERIAL PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES inventory_locations(id) ON DELETE RESTRICT,
  batch_id INTEGER REFERENCES inventory_batches(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'OPENING_STOCK', 'PURCHASE_RECEIPT', 'SALE', 'CUSTOMER_RETURN', 'PURCHASE_RETURN',
    'TRANSFER_OUT', 'TRANSFER_IN', 'STOCK_ADJUSTMENT_IN', 'STOCK_ADJUSTMENT_OUT',
    'DAMAGE', 'EXPIRY', 'LOSS', 'SHRINKAGE', 'TESTER', 'SAMPLE', 'INTERNAL_USE'
  )),
  -- Signed: positive = stock in, negative = stock out. Matches the sign
  -- convention already used by stock_movements.quantity_changed.
  quantity NUMERIC(14,3) NOT NULL,
  balance_after NUMERIC(14,3),
  unit_cost NUMERIC(14,2),
  total_cost NUMERIC(14,2),
  reference_type TEXT,
  reference_id INTEGER,
  reason TEXT,
  business_day_id INTEGER REFERENCES business_days(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant ON inventory_movements(variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_location ON inventory_movements(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_batch ON inventory_movements(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_reference ON inventory_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created ON inventory_movements(created_at DESC);
-- One (variant, location, batch, movement_type, reference) posts at most
-- once — the idempotency guard receiveStock()/issueStock() rely on for
-- retries. Split as two partial indexes because a NULL batch_id (tracking
-- mode 'none') must still collapse to a single row per reference, while a
-- FEFO sale split across several batches needs one row per batch.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movements_dedupe_batch
  ON inventory_movements(variant_id, location_id, batch_id, movement_type, reference_type, reference_id)
  WHERE batch_id IS NOT NULL AND reference_type IS NOT NULL AND reference_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movements_dedupe_nobatch
  ON inventory_movements(variant_id, location_id, movement_type, reference_type, reference_id)
  WHERE batch_id IS NULL AND reference_type IS NOT NULL AND reference_id IS NOT NULL;
