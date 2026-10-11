ALTER TABLE inventory_reservations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_points_balance NUMERIC(14,2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_reservation_expiry ON inventory_reservations(expires_at) WHERE status='ACTIVE';
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'retail_pos';
ALTER TABLE retail_sales ADD COLUMN IF NOT EXISTS delivery_charge NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE retail_online_orders ADD COLUMN IF NOT EXISTS owner_hash TEXT;
ALTER TABLE retail_online_orders ADD COLUMN IF NOT EXISTS request_hash TEXT;
ALTER TABLE retail_online_orders ADD COLUMN IF NOT EXISTS quote_json TEXT;
ALTER TABLE retail_online_orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE retail_online_orders ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_online_order_owner ON retail_online_orders(owner_hash,id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_online_order_sale ON retail_online_orders(retail_sale_id) WHERE retail_sale_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS retail_online_events (
 id SERIAL PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES retail_online_orders(id),event TEXT NOT NULL,
 actor_id INTEGER REFERENCES users(id),detail TEXT,notification_status TEXT NOT NULL DEFAULT 'NO_PROVIDER',
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_online_events_order ON retail_online_events(order_id,id);
CREATE TABLE IF NOT EXISTS retail_customer_accounts (
 id SERIAL PRIMARY KEY,customer_id INTEGER NOT NULL UNIQUE REFERENCES customers(id),username TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS retail_customer_invites (
 id SERIAL PRIMARY KEY,customer_id INTEGER NOT NULL REFERENCES customers(id),token_hash TEXT NOT NULL UNIQUE,
 expires_at TIMESTAMPTZ NOT NULL,used_at TIMESTAMPTZ,created_by INTEGER NOT NULL REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS retail_customer_sessions (
 token_hash TEXT PRIMARY KEY,account_id INTEGER NOT NULL REFERENCES retail_customer_accounts(id),expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_expiry ON retail_customer_sessions(expires_at);
CREATE TABLE IF NOT EXISTS retail_public_limits (
 bucket TEXT PRIMARY KEY,window_start BIGINT NOT NULL,hits INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS retail_online_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 0,store_name TEXT NOT NULL DEFAULT '99 Shop by Shahana',
 pickup_instructions TEXT NOT NULL DEFAULT 'Collect from our store after your order is ready.',
 delivery_enabled INTEGER NOT NULL DEFAULT 0,delivery_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
 free_delivery_threshold NUMERIC(14,2),reservation_minutes INTEGER NOT NULL DEFAULT 120,
 payment_instructions TEXT NOT NULL DEFAULT '',manual_payment_enabled INTEGER NOT NULL DEFAULT 0,
 return_policy TEXT NOT NULL DEFAULT 'Contact the store with your order number for a return or exchange.'
);
INSERT INTO retail_online_settings(id) VALUES (1) ON CONFLICT(id) DO NOTHING;
