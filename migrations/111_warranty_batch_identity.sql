ALTER TABLE warranty_claims ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES inventory_batches(id);
