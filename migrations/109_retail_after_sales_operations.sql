-- Phase 2D: additive documents and immutable commercial/analytical evidence.
CREATE TABLE IF NOT EXISTS warranty_policies (
 id SERIAL PRIMARY KEY, name TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('BUSINESS','BRAND','PRODUCT','SKU')),
 scope_key TEXT NOT NULL DEFAULT '', duration INTEGER NOT NULL CHECK(duration BETWEEN 1 AND 3650),
 duration_unit TEXT NOT NULL CHECK(duration_unit IN ('DAYS','MONTHS')), start_event TEXT NOT NULL DEFAULT 'FULFILLED_SALE' CHECK(start_event='FULFILLED_SALE'),
 coverage TEXT NOT NULL, exclusions TEXT NOT NULL DEFAULT '', proof_required INTEGER NOT NULL DEFAULT 1,
 serial_required INTEGER NOT NULL DEFAULT 0, customer_required INTEGER NOT NULL DEFAULT 0,
 replacement_rule TEXT NOT NULL CHECK(replacement_rule IN ('ORIGINAL_EXPIRY','NEW_FULL','SPECIFIED')),
 replacement_days INTEGER CHECK(replacement_days BETWEEN 1 AND 3650), active INTEGER NOT NULL DEFAULT 1,
 version INTEGER NOT NULL DEFAULT 1, created_by INTEGER REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS warranty_policy_active_scope ON warranty_policies(scope,scope_key) WHERE active=1;
CREATE TABLE IF NOT EXISTS warranty_snapshots (
 id SERIAL PRIMARY KEY, sale_id INTEGER NOT NULL REFERENCES retail_sales(id), sale_line_id INTEGER NOT NULL REFERENCES retail_sale_lines(id),
 variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id), customer_id INTEGER REFERENCES customers(id),
 serial_number TEXT NOT NULL DEFAULT '', quantity NUMERIC(14,3) NOT NULL CHECK(quantity>0),
 policy_id INTEGER REFERENCES warranty_policies(id), terms TEXT NOT NULL, starts_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ,
 origin_claim_id INTEGER, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS warranty_snapshot_original ON warranty_snapshots(sale_line_id,serial_number) WHERE origin_claim_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS warranty_snapshot_replacement ON warranty_snapshots(origin_claim_id) WHERE origin_claim_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS warranty_snapshot_customer ON warranty_snapshots(customer_id,id);
CREATE INDEX IF NOT EXISTS warranty_snapshot_serial ON warranty_snapshots(serial_number);
CREATE TABLE IF NOT EXISTS warranty_claims (
 id SERIAL PRIMARY KEY, claim_number TEXT NOT NULL UNIQUE, snapshot_id INTEGER REFERENCES warranty_snapshots(id),
 sale_id INTEGER NOT NULL REFERENCES retail_sales(id), sale_line_id INTEGER NOT NULL REFERENCES retail_sale_lines(id),
 variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id), customer_id INTEGER REFERENCES customers(id),
 serial_number TEXT NOT NULL DEFAULT '', quantity NUMERIC(14,3) NOT NULL CHECK(quantity>0),
 issue TEXT NOT NULL, description TEXT NOT NULL, condition TEXT NOT NULL DEFAULT '', accessories TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'SUBMITTED', eligibility TEXT NOT NULL, resolution TEXT,
 disposition TEXT, custody TEXT NOT NULL DEFAULT 'CUSTOMER', assigned_to INTEGER REFERENCES users(id),
 channel TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL,
 return_id INTEGER REFERENCES retail_returns(id), replacement_serial TEXT, replacement_variant_id INTEGER REFERENCES menu_item_variants(id),
 created_by INTEGER REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, resolved_at TIMESTAMP, closed_at TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS warranty_claim_open_serial ON warranty_claims(serial_number) WHERE serial_number<>'' AND status NOT IN ('CLOSED','CANCELLED');
CREATE INDEX IF NOT EXISTS warranty_claim_worklist ON warranty_claims(status,created_at);
CREATE INDEX IF NOT EXISTS warranty_claim_sale ON warranty_claims(sale_line_id);
CREATE INDEX IF NOT EXISTS warranty_claim_customer ON warranty_claims(customer_id,id);
CREATE TABLE IF NOT EXISTS warranty_events (
 id SERIAL PRIMARY KEY, claim_id INTEGER REFERENCES warranty_claims(id), kind TEXT NOT NULL, actor_id INTEGER REFERENCES users(id),
 internal_note TEXT NOT NULL DEFAULT '', customer_note TEXT NOT NULL DEFAULT '', evidence TEXT NOT NULL DEFAULT '{}',
 request_key TEXT, request_hash TEXT, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(claim_id,request_key)
);
CREATE TABLE IF NOT EXISTS warranty_inspections (
 id SERIAL PRIMARY KEY, claim_id INTEGER NOT NULL REFERENCES warranty_claims(id), received_condition TEXT NOT NULL,
 observed_fault TEXT NOT NULL, test_result TEXT NOT NULL, customer_damage INTEGER NOT NULL DEFAULT 0,
 eligibility TEXT NOT NULL, recommended_resolution TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
 inspector_id INTEGER REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS warranty_repairs (
 id SERIAL PRIMARY KEY, claim_id INTEGER NOT NULL UNIQUE REFERENCES warranty_claims(id), status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
 technician_id INTEGER REFERENCES users(id), diagnosis TEXT NOT NULL, work_performed TEXT NOT NULL DEFAULT '',
 started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS warranty_economics (
 id SERIAL PRIMARY KEY, claim_id INTEGER NOT NULL REFERENCES warranty_claims(id), kind TEXT NOT NULL CHECK(kind IN ('PART','REPLACEMENT')),
 variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id), quantity NUMERIC(14,3) NOT NULL CHECK(quantity>0),
 serial_numbers TEXT NOT NULL DEFAULT '[]', carrying_value NUMERIC(14,2) NOT NULL DEFAULT 0,
 created_by INTEGER REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS warranty_one_replacement ON warranty_economics(claim_id) WHERE kind='REPLACEMENT';
CREATE TABLE IF NOT EXISTS warranty_rmas (
 id SERIAL PRIMARY KEY, rma_number TEXT NOT NULL UNIQUE, claim_id INTEGER NOT NULL UNIQUE REFERENCES warranty_claims(id),
 supplier_id INTEGER NOT NULL REFERENCES suppliers(id), grn_id INTEGER REFERENCES goods_receipts(id),
 supplier_reference TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'SENT', expected_date DATE,
 outcome TEXT, notes TEXT NOT NULL DEFAULT '', sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS operations_policies (
 variant_id INTEGER PRIMARY KEY REFERENCES menu_item_variants(id), config TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 updated_by INTEGER REFERENCES users(id), updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS operations_snapshots (
 id SERIAL PRIMARY KEY, variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id), horizon INTEGER NOT NULL,
 fingerprint TEXT NOT NULL UNIQUE, evidence TEXT NOT NULL, generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS operations_snapshot_variant ON operations_snapshots(variant_id,generated_at);
CREATE TABLE IF NOT EXISTS operations_decisions (
 id SERIAL PRIMARY KEY, snapshot_id INTEGER NOT NULL REFERENCES operations_snapshots(id), action TEXT NOT NULL,
 suggested_quantity NUMERIC(14,3) NOT NULL, final_quantity NUMERIC(14,3), supplier_id INTEGER REFERENCES suppliers(id),
 reason TEXT NOT NULL, actor_id INTEGER REFERENCES users(id), po_id INTEGER REFERENCES purchase_orders(id),
 request_key TEXT NOT NULL UNIQUE, request_hash TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS operations_policy_audit (
 id SERIAL PRIMARY KEY, variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id), before_config TEXT, after_config TEXT NOT NULL,
 actor_id INTEGER REFERENCES users(id), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS phase2d_demand_lines ON retail_sale_lines(variant_id,retail_sale_id);
CREATE INDEX IF NOT EXISTS phase2d_demand_sales ON retail_sales(completed_at,id) WHERE status='COMPLETED';
CREATE INDEX IF NOT EXISTS phase2d_stock_history ON inventory_movements(variant_id,created_at);
INSERT INTO accounts(code,name,type,subtype,is_active,is_system)
VALUES ('5043','Warranty & After-Sales Expense','expense','warranty',1,1) ON CONFLICT(code) DO NOTHING;
