-- Retail sales: an independent domain from the restaurant orders/bills/tables
-- stack. A retail sale never needs a table_id, waiter_id, KOT or dine-in
-- channel — see lib/retail-sales.js for the full rationale. HELD is the cart
-- state (no inventory/accounting effect); COMPLETED is the one-way,
-- financially-posted terminal state for this phase (void/refund is Phase 5).

CREATE TABLE IF NOT EXISTS retail_sales (
  id SERIAL PRIMARY KEY,
  sale_number TEXT UNIQUE,
  location_id INTEGER REFERENCES inventory_locations(id),
  customer_id INTEGER REFERENCES customers(id),
  cashier_id INTEGER REFERENCES users(id),
  business_day_id INTEGER REFERENCES business_days(id),
  status TEXT NOT NULL DEFAULT 'HELD' CHECK (status IN ('HELD', 'COMPLETED', 'CANCELLED')),
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_reason TEXT,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_due NUMERIC(14,2) NOT NULL DEFAULT 0,
  cogs_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  idempotency_key TEXT UNIQUE,
  held_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  completed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_retail_sales_status ON retail_sales(status);
CREATE INDEX IF NOT EXISTS idx_retail_sales_cashier ON retail_sales(cashier_id);
CREATE INDEX IF NOT EXISTS idx_retail_sales_business_day ON retail_sales(business_day_id);
CREATE INDEX IF NOT EXISTS idx_retail_sales_customer ON retail_sales(customer_id);

CREATE TABLE IF NOT EXISTS retail_sale_lines (
  id SERIAL PRIMARY KEY,
  retail_sale_id INTEGER NOT NULL REFERENCES retail_sales(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id),
  -- historical snapshots — an old invoice must never re-render with today's name/price.
  sku_snapshot TEXT,
  product_name_snapshot TEXT NOT NULL,
  variant_name_snapshot TEXT,
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14,2) NOT NULL,
  list_price NUMERIC(14,2),
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- filled only at completion (HELD lines have no cost basis yet).
  unit_cost NUMERIC(14,4),
  total_cost NUMERIC(14,2),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_retail_sale_lines_sale ON retail_sale_lines(retail_sale_id);
CREATE INDEX IF NOT EXISTS idx_retail_sale_lines_variant ON retail_sale_lines(variant_id);

-- Which physical batches a line's quantity was actually issued from (FEFO may
-- split one line across several) — so a later return can identify and credit
-- the correct batch instead of guessing.
CREATE TABLE IF NOT EXISTS retail_sale_line_batches (
  id SERIAL PRIMARY KEY,
  retail_sale_line_id INTEGER NOT NULL REFERENCES retail_sale_lines(id) ON DELETE CASCADE,
  batch_id INTEGER NOT NULL REFERENCES inventory_batches(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0)
);
CREATE INDEX IF NOT EXISTS idx_retail_sale_line_batches_line ON retail_sale_line_batches(retail_sale_line_id);

CREATE TABLE IF NOT EXISTS retail_sale_payments (
  id SERIAL PRIMARY KEY,
  retail_sale_id INTEGER NOT NULL REFERENCES retail_sales(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  cash_tendered NUMERIC(14,2),
  change_given NUMERIC(14,2),
  reference TEXT,
  provider TEXT,
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_retail_sale_payments_sale ON retail_sale_payments(retail_sale_id);
