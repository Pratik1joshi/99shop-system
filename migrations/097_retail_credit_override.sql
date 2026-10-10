CREATE TABLE IF NOT EXISTS retail_credit_overrides (
  id SERIAL PRIMARY KEY,
  retail_sale_id INTEGER NOT NULL UNIQUE REFERENCES retail_sales(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  credit_amount NUMERIC(14,2) NOT NULL CHECK (credit_amount > 0),
  exposure_before NUMERIC(14,2) NOT NULL,
  credit_limit NUMERIC(14,2) NOT NULL,
  reason TEXT NOT NULL,
  approved_by INTEGER NOT NULL REFERENCES users(id),
  approved_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_retail_credit_overrides_customer ON retail_credit_overrides(customer_id,approved_at DESC);
