-- Additive lookup indexes. Existing document/barcode/serial UNIQUE constraints
-- already index their primary identifiers; these cover compatibility and paging.
CREATE INDEX IF NOT EXISTS idx_commerce_variant_sku ON menu_item_variants(sku);
CREATE INDEX IF NOT EXISTS idx_commerce_variant_barcode ON menu_item_variants(barcode);
CREATE INDEX IF NOT EXISTS idx_commerce_product_barcode ON menu_items(barcode);
CREATE INDEX IF NOT EXISTS idx_commerce_batch_number ON inventory_batches(batch_number);
CREATE INDEX IF NOT EXISTS idx_commerce_payment_reference ON retail_sale_payments(reference);
CREATE INDEX IF NOT EXISTS idx_commerce_sales_completed_id ON retail_sales(completed_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_held_owner ON retail_sales(cashier_id,status,held_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_serial_available ON inventory_serials(variant_id,location_id,status,serial_number);
