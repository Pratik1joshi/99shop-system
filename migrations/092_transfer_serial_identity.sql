-- Exact serials selected on a transfer line and followed through transit.
CREATE TABLE IF NOT EXISTS retail_transfer_line_serials (
  id SERIAL PRIMARY KEY,
  retail_transfer_line_id INTEGER NOT NULL REFERENCES retail_transfer_lines(id) ON DELETE CASCADE,
  serial_number TEXT NOT NULL,
  received_at TIMESTAMP,
  UNIQUE (retail_transfer_line_id, serial_number)
);
CREATE INDEX IF NOT EXISTS idx_transfer_line_serials_line ON retail_transfer_line_serials(retail_transfer_line_id);
