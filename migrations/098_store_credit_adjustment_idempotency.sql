ALTER TABLE store_credit_transactions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_credit_adjustment_key
  ON store_credit_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;
