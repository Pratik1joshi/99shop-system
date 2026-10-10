-- Retain cashier compatibility while adding distinct capability-driven Retail
-- staff identities. Individual actions remain governed by role_permissions.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
  'admin','cashier','inventory_staff','purchasing_staff','accountant','manager','waiter','kitchen'
));
