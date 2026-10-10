-- Selected invoice allocations for new supplier payments. The journal remains
-- the monetary source of truth; these rows explain how it settled charges.
CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  payment_journal_id INTEGER NOT NULL REFERENCES journal_entries(id),
  charge_journal_id INTEGER NOT NULL REFERENCES journal_entries(id),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu'),
  UNIQUE (payment_journal_id, charge_journal_id)
);
CREATE INDEX IF NOT EXISTS idx_supplier_payment_allocations_supplier ON supplier_payment_allocations(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payment_allocations_charge ON supplier_payment_allocations(charge_journal_id);
