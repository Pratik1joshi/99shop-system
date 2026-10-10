-- Final phase: promotions extensions (columns only, added by lib/promotions.js
-- and lib/retail-promotions.js via ensureColumn — dual-driver safe, no DDL
-- needed here), loyalty, serial tracking, reservations, online orders.
--
-- The six CREATE TABLEs below were previously created only through
-- lib/db/ensure-sqlite-table.js's ensureSqliteTable(), which is a deliberate
-- no-op on Postgres ("schema comes from migrations" — see that file's
-- header). Every other retail phase got a matching numbered migration for
-- its new tables; this one was missed, which meant a production Postgres
-- deployment would 500 on every loyalty/serial/reservation/online-order
-- call despite all SQLite tests passing. Column-only additions
-- (customers.loyalty_points_balance, promotions.priority, etc.) already
-- flow through ensureColumn(), which IS dual-driver safe, so they need no
-- entry here.

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  type TEXT NOT NULL,
  points NUMERIC(14,2) NOT NULL,
  balance_after NUMERIC(14,2) NOT NULL,
  source_type TEXT,
  source_id INTEGER,
  reason TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer ON loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_source ON loyalty_transactions(source_type, source_id);

CREATE TABLE IF NOT EXISTS inventory_serials (
  id SERIAL PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id),
  serial_number TEXT NOT NULL UNIQUE,
  location_id INTEGER REFERENCES inventory_locations(id),
  status TEXT NOT NULL DEFAULT 'IN_STOCK',
  supplier_id INTEGER REFERENCES suppliers(id),
  reference_type TEXT,
  reference_id INTEGER,
  unit_cost NUMERIC(14,4),
  received_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  sold_at TIMESTAMP,
  sale_line_id INTEGER,
  returned_at TIMESTAMP,
  warranty_months INTEGER,
  warranty_end_date DATE,
  warranty_notes TEXT,
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_inventory_serials_variant ON inventory_serials(variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_serials_status ON inventory_serials(status);

CREATE TABLE IF NOT EXISTS goods_receipt_line_serials (
  id SERIAL PRIMARY KEY,
  goods_receipt_line_id INTEGER NOT NULL REFERENCES goods_receipt_lines(id) ON DELETE CASCADE,
  serial_number TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_line_serials_line ON goods_receipt_line_serials(goods_receipt_line_id);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id SERIAL PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id),
  location_id INTEGER NOT NULL REFERENCES inventory_locations(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  source_type TEXT NOT NULL,
  source_id INTEGER NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_variant ON inventory_reservations(variant_id, location_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_source ON inventory_reservations(source_type, source_id);

CREATE TABLE IF NOT EXISTS retail_online_orders (
  id SERIAL PRIMARY KEY,
  order_number TEXT UNIQUE,
  source TEXT NOT NULL DEFAULT 'MANUAL_ONLINE',
  customer_id INTEGER REFERENCES customers(id),
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  fulfillment_type TEXT NOT NULL DEFAULT 'PICKUP',
  shipping_address TEXT,
  delivery_phone TEXT,
  delivery_notes TEXT,
  delivery_charge NUMERIC(14,2) NOT NULL DEFAULT 0,
  location_id INTEGER REFERENCES inventory_locations(id),
  status TEXT NOT NULL DEFAULT 'PENDING',
  payment_status TEXT NOT NULL DEFAULT 'UNPAID',
  payment_method TEXT,
  payment_reference TEXT,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  retail_sale_id INTEGER,
  idempotency_key TEXT UNIQUE,
  cancel_reason TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  confirmed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  fulfilled_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_retail_online_orders_status ON retail_online_orders(status);
CREATE INDEX IF NOT EXISTS idx_retail_online_orders_customer ON retail_online_orders(customer_id);

CREATE TABLE IF NOT EXISTS retail_online_order_lines (
  id SERIAL PRIMARY KEY,
  retail_online_order_id INTEGER NOT NULL REFERENCES retail_online_orders(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14,2) NOT NULL,
  product_name_snapshot TEXT,
  variant_name_snapshot TEXT
);
CREATE INDEX IF NOT EXISTS idx_retail_online_order_lines_order ON retail_online_order_lines(retail_online_order_id);
