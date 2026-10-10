ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS submitted_by INTEGER;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS rejected_by INTEGER;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
