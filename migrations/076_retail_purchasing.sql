-- Retail purchasing: Purchase Order -> Goods Receipt -> Accounts Payable ->
-- Supplier Payment -> Purchase Return, built on the Phase 2 retail inventory
-- ledger (inventory_locations/batches/balances/movements) and variants.
--
-- This is deliberately separate from the legacy purchases/purchase_items
-- tables (which model a restaurant ingredient's combined receipt+invoice
-- event, keyed to inventory_items). Retail lines are keyed to
-- menu_item_variants and need PO-vs-GRN separation, cumulative partial
-- receiving, and per-line batch splitting that the legacy shape doesn't
-- represent. Both systems keep working side by side — see
-- lib/retail-purchasing.js for the dispatch boundary.

CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  po_number TEXT NOT NULL UNIQUE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  location_id INTEGER REFERENCES inventory_locations(id),
  order_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  expected_date DATE,
  currency TEXT NOT NULL DEFAULT 'NPR',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED', 'CLOSED'
  )),
  created_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id SERIAL PRIMARY KEY,
  purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id),
  supplier_product_code TEXT,
  ordered_quantity NUMERIC(14,3) NOT NULL CHECK (ordered_quantity > 0),
  purchase_unit TEXT NOT NULL DEFAULT 'unit',
  -- how many stock (consumption) units are inside one purchase_unit — 1 carton = 24 pieces => 24.
  conversion_factor NUMERIC(14,4) NOT NULL DEFAULT 1 CHECK (conversion_factor > 0),
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- cumulative, in purchase_unit, across every posted GRN line against this PO line.
  quantity_received NUMERIC(14,3) NOT NULL DEFAULT 0,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po ON purchase_order_lines(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_variant ON purchase_order_lines(variant_id);

CREATE TABLE IF NOT EXISTS goods_receipts (
  id SERIAL PRIMARY KEY,
  grn_number TEXT NOT NULL UNIQUE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  purchase_order_id INTEGER REFERENCES purchase_orders(id),
  location_id INTEGER NOT NULL REFERENCES inventory_locations(id),
  receipt_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  received_by INTEGER REFERENCES users(id),
  -- The existing app doesn't separate "physical receipt" from "supplier
  -- invoice" for the legacy purchase flow either (lib/purchases.js: one
  -- combined event) — same choice here, documented at the top of
  -- lib/retail-purchasing.js. invoice_number/date/payment_method live on the
  -- GRN itself; there is no separate supplier_invoices table.
  invoice_number TEXT,
  invoice_date DATE,
  payment_method TEXT NOT NULL DEFAULT 'credit',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'VOIDED')),
  posted_at TIMESTAMP,
  voided_at TIMESTAMP,
  void_reason TEXT,
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_supplier ON goods_receipts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_po ON goods_receipts(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_status ON goods_receipts(status);
-- Duplicate supplier invoice protection, scoped per supplier (spec 17/23/45).
CREATE UNIQUE INDEX IF NOT EXISTS idx_goods_receipts_supplier_invoice_unique
  ON goods_receipts(supplier_id, invoice_number)
  WHERE invoice_number IS NOT NULL AND invoice_number <> '' AND status <> 'VOIDED';

CREATE TABLE IF NOT EXISTS goods_receipt_lines (
  id SERIAL PRIMARY KEY,
  goods_receipt_id INTEGER NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  purchase_order_line_id INTEGER REFERENCES purchase_order_lines(id),
  variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id),
  quantity_received NUMERIC(14,3) NOT NULL CHECK (quantity_received > 0), -- in purchase_unit
  purchase_unit TEXT NOT NULL DEFAULT 'unit',
  conversion_factor NUMERIC(14,4) NOT NULL DEFAULT 1 CHECK (conversion_factor > 0),
  stock_quantity NUMERIC(14,3) NOT NULL, -- quantity_received * conversion_factor, what actually posts to inventory
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0), -- per purchase_unit
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_grn ON goods_receipt_lines(goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_po_line ON goods_receipt_lines(purchase_order_line_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_variant ON goods_receipt_lines(variant_id);

-- One GRN line may split into several batches (spec 10/11): "100 ordered,
-- received Batch VC2601=60 + VC2602=40". No split row at all (tracking_mode
-- 'none') means the whole line posts batchless.
CREATE TABLE IF NOT EXISTS goods_receipt_line_batches (
  id SERIAL PRIMARY KEY,
  goods_receipt_line_id INTEGER NOT NULL REFERENCES goods_receipt_lines(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  manufactured_date DATE,
  expiry_date DATE,
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0) -- stock units
);
CREATE INDEX IF NOT EXISTS idx_grn_line_batches_line ON goods_receipt_line_batches(goods_receipt_line_id);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id SERIAL PRIMARY KEY,
  return_number TEXT NOT NULL UNIQUE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  goods_receipt_id INTEGER REFERENCES goods_receipts(id),
  location_id INTEGER NOT NULL REFERENCES inventory_locations(id),
  return_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  reason TEXT,
  refund_method TEXT NOT NULL DEFAULT 'credit_note', -- credit_note (reduces AP) | cash | bank
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'VOIDED')),
  created_by INTEGER REFERENCES users(id),
  posted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier ON purchase_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_grn ON purchase_returns(goods_receipt_id);

CREATE TABLE IF NOT EXISTS purchase_return_lines (
  id SERIAL PRIMARY KEY,
  purchase_return_id INTEGER NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  goods_receipt_line_id INTEGER REFERENCES goods_receipt_lines(id),
  variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id),
  batch_id INTEGER REFERENCES inventory_batches(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0), -- stock units
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_purchase_return_lines_return ON purchase_return_lines(purchase_return_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_lines_grn_line ON purchase_return_lines(goods_receipt_line_id);
