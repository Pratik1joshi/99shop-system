import bcrypt from 'bcryptjs';
import { logger } from '../logger.js';

export const SQLITE_SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT UNIQUE NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'cashier', 'inventory_staff', 'purchasing_staff', 'accountant', 'manager')),
  email TEXT,
  phone TEXT,
  is_active INTEGER DEFAULT 1,
  must_change_password INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT UNIQUE NOT NULL,
  device_name TEXT,
  device_type TEXT,
  ip_address TEXT,
  last_seen DATETIME,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS menu_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  icon TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  category_id INTEGER NOT NULL REFERENCES menu_categories(id),
  base_price REAL NOT NULL CHECK (base_price >= 0),
  image_url TEXT,
  is_available INTEGER DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  barcode TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS menu_item_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL,
  price_modifier REAL DEFAULT 0,
  is_default INTEGER DEFAULT 0,
  barcode TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  total_visits INTEGER DEFAULT 0,
  total_spent REAL DEFAULT 0,
  credit_limit REAL DEFAULT 0,
  current_credit REAL DEFAULT 0,
  is_vip INTEGER DEFAULT 0,
  is_blacklisted INTEGER DEFAULT 0,
  notes TEXT,
  phone_digits TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT,
  category TEXT,
  amount REAL NOT NULL,
  expense_date DATE,
  purchase_date TEXT,
  supplier TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rate_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rate_key TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

export function seedDemoData(db) {
  logger.info('seeding_sqlite_demo_data_start');

  // Starting staff, with hashed PINs. Change them after the first login.
  const users = [
    { username: 'admin', pin: '123456', name: 'Shop Admin', role: 'admin' },
    { username: 'sita', pin: '7890', name: 'Sita Cashier', role: 'cashier' },
  ];

  for (const u of users) {
    const hash = bcrypt.hashSync(u.pin, 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, is_active, must_change_password)
      VALUES (?, ?, ?, ?, 1, 0)
    `).run(u.username, hash, u.name, u.role);
  }

  const settings = [
    { key: 'shop_name', value: '99 Shop by Shahana' },
    { key: 'shop_address', value: 'Surkhet, Nepal' },
    { key: 'shop_phone', value: '+977 976-7896814' },
    { key: 'shop_email', value: '' },
    { key: 'currency_symbol', value: 'Rs' },
    // Tax defaults to 0% and remains editable in Settings.
    { key: 'vat_percentage', value: '0' },
    { key: 'owner_name', value: '' },
  ];

  for (const s of settings) {
    db.prepare(`
      INSERT INTO system_settings (setting_key, setting_value)
      VALUES (?, ?)
    `).run(s.key, s.value);
  }

  logger.info('seeding_sqlite_demo_data_complete');
}
