-- Exact serial identity on supplier returns, captured before posting.
CREATE TABLE IF NOT EXISTS purchase_return_line_serials (
  id SERIAL PRIMARY KEY,
  purchase_return_line_id INTEGER NOT NULL REFERENCES purchase_return_lines(id) ON DELETE CASCADE,
  serial_number TEXT NOT NULL,
  UNIQUE (purchase_return_line_id, serial_number)
);
CREATE INDEX IF NOT EXISTS idx_purchase_return_line_serials_line ON purchase_return_line_serials(purchase_return_line_id);
