-- Prospective master evidence only. No reconstructed historical events.
CREATE TABLE IF NOT EXISTS customer_master_audit (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('CREATED','UPDATED','DELETED')),
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_customer_master_audit_customer ON customer_master_audit(customer_id,created_at,id);
CREATE INDEX IF NOT EXISTS idx_customer_master_audit_time ON customer_master_audit(created_at,id);
