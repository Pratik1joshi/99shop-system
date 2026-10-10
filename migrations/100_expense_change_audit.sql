-- Canonical expense correction service already writes this table on SQLite.
-- Supply the same durable evidence table on PostgreSQL.
CREATE TABLE IF NOT EXISTS expense_change_audit (
  id SERIAL PRIMARY KEY,
  expense_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  request_key TEXT UNIQUE,
  performed_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
CREATE INDEX IF NOT EXISTS idx_expense_change_audit_time ON expense_change_audit(created_at,id);
