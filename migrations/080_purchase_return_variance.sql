-- Phase 4.5: a purchase return has two distinct values that are not
-- guaranteed equal — see lib/retail-purchasing.js's postPurchaseReturn():
--   1. supplier credit (purchase_return_lines.unit_cost/net_amount) — what
--      the supplier actually credits, defaulting to the original GRN line's
--      price if not overridden.
--   2. inventory carrying value removed — always the moving average at the
--      instant of the return (same rule as every other outbound movement).
-- The difference posts to a new variance account (5090) rather than being
-- forced to match either figure.

INSERT INTO accounts (code, name, type, subtype, is_system)
VALUES ('5090', 'Purchase Price Variance', 'expense', 'variance', 1)
ON CONFLICT (code) DO NOTHING;
UPDATE accounts SET parent_id = (SELECT id FROM accounts WHERE code = '5000')
WHERE code = '5090' AND parent_id IS NULL;

ALTER TABLE purchase_return_lines ADD COLUMN IF NOT EXISTS inventory_unit_cost NUMERIC(14,4);
ALTER TABLE purchase_return_lines ADD COLUMN IF NOT EXISTS inventory_value NUMERIC(14,2);
ALTER TABLE purchase_return_lines ADD COLUMN IF NOT EXISTS variance_amount NUMERIC(14,2);
