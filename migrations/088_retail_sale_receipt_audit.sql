-- Receipt reprint requests are Retail events, separate from legacy bill audit.
CREATE TABLE IF NOT EXISTS retail_sale_audit (
  id SERIAL PRIMARY KEY,
  retail_sale_id INTEGER NOT NULL REFERENCES retail_sales(id),
  event TEXT NOT NULL CHECK (event IN ('REPRINT_REQUESTED')),
  actor_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_retail_sale_audit_sale ON retail_sale_audit(retail_sale_id, id DESC);
