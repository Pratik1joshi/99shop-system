-- Phase 5: customer returns, refunds, exchanges, store credit.
--
-- New accounts (audited existing Chart of Accounts first — see
-- lib/retail-returns.js header for the full accounting model):
--   4011 Sales Returns    — contra-revenue, nets against 4010 in P&L
--                            (lib/accounting-reports.js sums ALL type='income'
--                            accounts generically, so this needs no report change)
--   2030 Store Credit Liability — a liability owed to the customer, never revenue
-- Write-offs reuse the EXISTING 5040 "Wastage / Inventory Loss" expense
-- account — a damaged cosmetic return is economically identical to
-- restaurant wastage (goods left the building at a loss), no new expense
-- account needed.

INSERT INTO accounts (code, name, type, subtype, is_system)
VALUES ('4011', 'Sales Returns', 'income', 'contra_revenue', 1)
ON CONFLICT (code) DO NOTHING;
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '4000')
WHERE code = '4011' AND parent_id IS NULL;

INSERT INTO accounts (code, name, type, subtype, is_system)
VALUES ('2030', 'Store Credit Liability', 'liability', 'store_credit', 1)
ON CONFLICT (code) DO NOTHING;
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '2000')
WHERE code = '2030' AND parent_id IS NULL;

-- inventory_locations gained no sellable/non-sellable distinction in Phase 2 —
-- getSellableStock()/getSellableBatches() only ever checked batch status,
-- never location. A quarantine/returns-holding location needs to be
-- physically real (so on-hand quantity is honest) but invisible to POS and
-- FEFO. Small additive column, not a new warehouse subsystem.
ALTER TABLE inventory_locations ADD COLUMN IF NOT EXISTS is_sellable INTEGER NOT NULL DEFAULT 1;

INSERT INTO inventory_locations (name, code, location_type, is_sellable, is_active)
SELECT 'Returns Quarantine', 'QUARANTINE', 'damaged', 0, 1
WHERE NOT EXISTS (SELECT 1 FROM inventory_locations WHERE code = 'QUARANTINE');

-- customers.store_credit_balance is a concurrency-control + fast-read cache,
-- not the source of truth — store_credit_transactions is authoritative and
-- every write updates both in the same transaction (see lib/retail-store-credit.js).
-- Locking this one row (SELECT ... FOR UPDATE) is what makes a redemption
-- atomic against a concurrent issue/redeem for the same customer.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS store_credit_balance NUMERIC(14,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS store_credit_transactions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  type TEXT NOT NULL CHECK (type IN ('ISSUE', 'REDEEM', 'ADJUSTMENT', 'REVERSAL')),
  amount NUMERIC(14,2) NOT NULL, -- signed: +issue/adjustment-up, -redeem/adjustment-down
  balance_after NUMERIC(14,2) NOT NULL,
  source_type TEXT,
  source_id INTEGER,
  reason TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_store_credit_transactions_customer ON store_credit_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_store_credit_transactions_source ON store_credit_transactions(source_type, source_id);

-- Independent domain from restaurant refunds/voids (lib/bill-corrections.js) —
-- see lib/retail-returns.js. References retail_sales/retail_sale_lines only.
CREATE TABLE IF NOT EXISTS retail_returns (
  id SERIAL PRIMARY KEY,
  return_number TEXT UNIQUE,
  original_sale_id INTEGER NOT NULL REFERENCES retail_sales(id),
  business_day_id INTEGER REFERENCES business_days(id),
  customer_id INTEGER REFERENCES customers(id),
  cashier_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'CANCELLED')),
  reason TEXT,
  notes TEXT,
  refund_method TEXT, -- cash | online | store_credit | ar_reduction (set at post time)
  refund_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_reversal_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  store_credit_issued NUMERIC(14,2) NOT NULL DEFAULT 0,
  without_receipt INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  posted_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_retail_returns_sale ON retail_returns(original_sale_id);
CREATE INDEX IF NOT EXISTS idx_retail_returns_status ON retail_returns(status);

CREATE TABLE IF NOT EXISTS retail_return_lines (
  id SERIAL PRIMARY KEY,
  retail_return_id INTEGER NOT NULL REFERENCES retail_returns(id) ON DELETE CASCADE,
  original_sale_line_id INTEGER NOT NULL REFERENCES retail_sale_lines(id),
  variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  -- historical, derived from the immutable original sale line at post time — never today's price/tax.
  unit_price NUMERIC(14,2) NOT NULL,
  discount_allocated NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_allocated NUMERIC(14,2) NOT NULL DEFAULT 0,
  refund_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit_cogs NUMERIC(14,4),
  condition TEXT NOT NULL CHECK (condition IN (
    'RESELLABLE', 'UNOPENED', 'OPENED', 'DAMAGED', 'DEFECTIVE', 'EXPIRED', 'WRONG_ITEM', 'OTHER'
  )),
  disposition TEXT NOT NULL CHECK (disposition IN (
    'RETURN_TO_SELLABLE', 'QUARANTINE', 'WRITE_OFF', 'NO_STOCK_RETURN'
  )),
  batch_id INTEGER REFERENCES inventory_batches(id),
  reason TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_retail_return_lines_return ON retail_return_lines(retail_return_id);
CREATE INDEX IF NOT EXISTS idx_retail_return_lines_sale_line ON retail_return_lines(original_sale_line_id);

-- Which original sale-line batch allocation a return line's quantity is
-- attributed to (a sale line may have drawn from several batches — see
-- retail_sale_line_batches). Enforced at post time: cannot exceed
-- (originally sold from that batch − previously returned against that batch).
CREATE TABLE IF NOT EXISTS retail_return_line_batches (
  id SERIAL PRIMARY KEY,
  retail_return_line_id INTEGER NOT NULL REFERENCES retail_return_lines(id) ON DELETE CASCADE,
  batch_id INTEGER NOT NULL REFERENCES inventory_batches(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0)
);
CREATE INDEX IF NOT EXISTS idx_retail_return_line_batches_line ON retail_return_line_batches(retail_return_line_id);

-- Return + replacement sale, linked. Both remain real, independently posted
-- retail_returns/retail_sales rows — this table is only the connective tissue,
-- never a variant_id swap on the original sale.
CREATE TABLE IF NOT EXISTS retail_exchanges (
  id SERIAL PRIMARY KEY,
  exchange_number TEXT UNIQUE,
  return_id INTEGER NOT NULL REFERENCES retail_returns(id),
  new_sale_id INTEGER NOT NULL REFERENCES retail_sales(id),
  difference_amount NUMERIC(14,2) NOT NULL DEFAULT 0, -- positive = customer paid more, negative = customer refunded
  settlement_method TEXT, -- cash | online | store_credit | ar (how the difference was settled)
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_retail_exchanges_return ON retail_exchanges(return_id);
CREATE INDEX IF NOT EXISTS idx_retail_exchanges_sale ON retail_exchanges(new_sale_id);
