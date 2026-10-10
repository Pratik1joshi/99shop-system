-- Physical serial identities frozen at count start and entered by the counter.
-- The quantity ledger remains inventory_movements; these rows document which
-- individual units explain a posted count variance.
CREATE TABLE IF NOT EXISTS retail_stock_count_line_serials (
  id SERIAL PRIMARY KEY,
  retail_stock_count_line_id INTEGER NOT NULL REFERENCES retail_stock_count_lines(id) ON DELETE CASCADE,
  serial_number TEXT NOT NULL,
  expected INTEGER NOT NULL DEFAULT 0,
  counted INTEGER NOT NULL DEFAULT 0,
  UNIQUE (retail_stock_count_line_id, serial_number)
);
CREATE INDEX IF NOT EXISTS idx_stock_count_line_serials_line ON retail_stock_count_line_serials(retail_stock_count_line_id);
