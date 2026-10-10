-- Each physical serial return has its own durable event identity. Historical
-- movements are left untouched; this is not a repair of previously lost stock.
CREATE TABLE IF NOT EXISTS retail_return_serial_events (
  id SERIAL PRIMARY KEY,
  return_line_id INTEGER NOT NULL REFERENCES retail_return_lines(id),
  serial_id INTEGER NOT NULL REFERENCES inventory_serials(id),
  UNIQUE (return_line_id, serial_id)
);
