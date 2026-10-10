ALTER TABLE warranty_rmas ADD COLUMN IF NOT EXISTS ownership TEXT NOT NULL DEFAULT 'CUSTOMER';
ALTER TABLE warranty_rmas ADD COLUMN IF NOT EXISTS source_location_id INTEGER REFERENCES inventory_locations(id);
ALTER TABLE warranty_rmas ADD COLUMN IF NOT EXISTS rma_location_id INTEGER REFERENCES inventory_locations(id);
ALTER TABLE warranty_rmas ADD COLUMN IF NOT EXISTS replacement_serial TEXT;
ALTER TABLE warranty_rmas ADD COLUMN IF NOT EXISTS purchase_return_id INTEGER REFERENCES purchase_returns(id);
INSERT INTO inventory_locations(name,code,location_type,is_sellable,is_active)
SELECT 'Supplier warranty custody','SUPPLIER_RMA','damaged',0,1
WHERE NOT EXISTS(SELECT 1 FROM inventory_locations WHERE code='SUPPLIER_RMA');
