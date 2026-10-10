-- One collection can settle several Retail credit sales without creating a
-- second sale or revenue entry. The document key makes retries idempotent.
CREATE TABLE IF NOT EXISTS retail_credit_collections (
  id SERIAL PRIMARY KEY,
  collection_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL,
  bank_account_id INTEGER,
  payment_reference TEXT,
  external_ref TEXT UNIQUE NOT NULL,
  journal_id INTEGER REFERENCES journal_entries(id),
  business_day_id INTEGER REFERENCES business_days(id),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_retail_credit_collections_customer ON retail_credit_collections(customer_id, id DESC);
CREATE TABLE IF NOT EXISTS retail_credit_collection_allocations (
  id SERIAL PRIMARY KEY,
  collection_id INTEGER NOT NULL REFERENCES retail_credit_collections(id) ON DELETE CASCADE,
  retail_sale_id INTEGER NOT NULL REFERENCES retail_sales(id),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  UNIQUE (collection_id, retail_sale_id)
);
CREATE INDEX IF NOT EXISTS idx_retail_credit_collection_allocations_sale ON retail_credit_collection_allocations(retail_sale_id);

CREATE TABLE IF NOT EXISTS retail_credit_writeoffs (
  id SERIAL PRIMARY KEY,
  retail_sale_id INTEGER NOT NULL REFERENCES retail_sales(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  external_ref TEXT UNIQUE NOT NULL,
  journal_id INTEGER REFERENCES journal_entries(id),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_retail_credit_writeoffs_sale ON retail_credit_writeoffs(retail_sale_id);
