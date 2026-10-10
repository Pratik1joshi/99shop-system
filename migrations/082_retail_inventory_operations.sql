-- Phase 6: inventory operations & stock control (transfers, stock counts,
-- damage/expiry/tester/sample/internal-use/shrinkage/manual adjustments,
-- quarantine move/release). All quantity changes still route through
-- inventory_balances/inventory_movements (lib/retail-inventory.js) — these
-- tables are operational documents/audit headers only, never a second
-- source of quantity truth.
--
-- New accounts (5041 Marketing & Sample Consumption, 5042 Inventory Gain /
-- Adjustment) are seeded by lib/accounting.js's own idempotent
-- seedAccounts() on both drivers — no INSERT needed here, see that file's
-- SEED_ACCOUNTS array.

ALTER TABLE menu_item_variants ADD COLUMN IF NOT EXISTS reorder_quantity NUMERIC(14,2);

-- Shared holding location for dispatched-but-not-yet-received transfer
-- stock — see lib/retail-inventory.js's ensureRetailInventorySchema header
-- comment for why a shared, reference-tagged location is safe here.
ALTER TABLE inventory_locations
  DROP CONSTRAINT IF EXISTS inventory_locations_location_type_check;
ALTER TABLE inventory_locations
  ADD CONSTRAINT inventory_locations_location_type_check
  CHECK (location_type IN ('shop', 'warehouse', 'display', 'damaged', 'returns', 'other', 'in_transit'));

INSERT INTO inventory_locations (name, code, location_type, is_sellable, is_active)
SELECT 'In Transit', 'IN_TRANSIT', 'in_transit', 0, 1
WHERE NOT EXISTS (SELECT 1 FROM inventory_locations WHERE code = 'IN_TRANSIT');

CREATE TABLE IF NOT EXISTS retail_transfers (
  id SERIAL PRIMARY KEY,
  transfer_number TEXT UNIQUE,
  source_location_id INTEGER NOT NULL REFERENCES inventory_locations(id),
  destination_location_id INTEGER NOT NULL REFERENCES inventory_locations(id),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'DISPATCHED', 'RECEIVED', 'CANCELLED')),
  requested_by INTEGER REFERENCES users(id),
  dispatched_by INTEGER REFERENCES users(id),
  received_by INTEGER REFERENCES users(id),
  requested_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  dispatched_at TIMESTAMP,
  received_at TIMESTAMP,
  notes TEXT,
  reason TEXT,
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_retail_transfers_status ON retail_transfers(status);

CREATE TABLE IF NOT EXISTS retail_transfer_lines (
  id SERIAL PRIMARY KEY,
  retail_transfer_id INTEGER NOT NULL REFERENCES retail_transfers(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id),
  batch_id INTEGER REFERENCES inventory_batches(id),
  requested_quantity NUMERIC(14,3) NOT NULL CHECK (requested_quantity > 0),
  dispatched_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  received_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  unit_cost_snapshot NUMERIC(14,4),
  discrepancy_reason TEXT,
  discrepancy_disposition TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_retail_transfer_lines_transfer ON retail_transfer_lines(retail_transfer_id);

CREATE TABLE IF NOT EXISTS retail_stock_counts (
  id SERIAL PRIMARY KEY,
  count_number TEXT UNIQUE,
  location_id INTEGER NOT NULL REFERENCES inventory_locations(id),
  count_type TEXT NOT NULL DEFAULT 'CYCLE' CHECK (count_type IN ('FULL', 'CYCLE', 'LOCATION', 'CATEGORY')),
  status TEXT NOT NULL DEFAULT 'COUNTING' CHECK (status IN ('DRAFT', 'COUNTING', 'REVIEW', 'POSTED', 'CANCELLED')),
  blind INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  counted_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  snapshot_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  snapshot_movement_id INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  completed_at TIMESTAMP,
  posted_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_retail_stock_counts_status ON retail_stock_counts(status);

CREATE TABLE IF NOT EXISTS retail_stock_count_lines (
  id SERIAL PRIMARY KEY,
  retail_stock_count_id INTEGER NOT NULL REFERENCES retail_stock_counts(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id),
  batch_id INTEGER REFERENCES inventory_batches(id),
  expected_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  snapshot_movement_id INTEGER NOT NULL DEFAULT 0,
  physical_quantity NUMERIC(14,3),
  reconciled_expected_quantity NUMERIC(14,3),
  variance NUMERIC(14,3),
  value_variance NUMERIC(14,2)
);
CREATE INDEX IF NOT EXISTS idx_retail_stock_count_lines_count ON retail_stock_count_lines(retail_stock_count_id);

CREATE TABLE IF NOT EXISTS retail_inventory_adjustments (
  id SERIAL PRIMARY KEY,
  adjustment_number TEXT UNIQUE,
  type TEXT NOT NULL CHECK (type IN (
    'DAMAGE', 'EXPIRY', 'TESTER', 'SAMPLE', 'INTERNAL_USE', 'SHRINKAGE',
    'MANUAL_POSITIVE', 'MANUAL_NEGATIVE', 'QUARANTINE_MOVE', 'QUARANTINE_RELEASE'
  )),
  variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id),
  location_id INTEGER REFERENCES inventory_locations(id),
  destination_location_id INTEGER REFERENCES inventory_locations(id),
  batch_id INTEGER REFERENCES inventory_batches(id),
  quantity NUMERIC(14,3) NOT NULL,
  unit_cost NUMERIC(14,4),
  total_value NUMERIC(14,2),
  reason TEXT,
  notes TEXT,
  idempotency_key TEXT UNIQUE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_retail_inventory_adjustments_type ON retail_inventory_adjustments(type);
CREATE INDEX IF NOT EXISTS idx_retail_inventory_adjustments_variant ON retail_inventory_adjustments(variant_id);
