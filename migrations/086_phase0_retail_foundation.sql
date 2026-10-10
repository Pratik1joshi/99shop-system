-- Phase 0: backward-compatible integrity fields. Legacy columns and rows remain.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS token_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);

-- Held sales must retain the exact identities selected for serial-tracked items.
ALTER TABLE retail_sale_lines ADD COLUMN IF NOT EXISTS serial_numbers_json TEXT;

-- Sales history and every date-scoped dashboard/report order or filter on the
-- completion timestamp. Keep the index partial so held carts do not bloat it.
CREATE INDEX IF NOT EXISTS idx_retail_sales_completed_at
  ON retail_sales(completed_at DESC, id DESC)
  WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_retail_sales_history
  ON retail_sales(completed_at DESC, id DESC)
  WHERE status <> 'HELD';
