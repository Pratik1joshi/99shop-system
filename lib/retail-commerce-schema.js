/**
 * SQLite schema for the catalog, pricing and online-store features.
 *
 * PostgreSQL gets this schema from migrations 104–107. Local SQLite databases
 * never ran those migrations, so catalog, merchandising and storefront pages
 * failed with "no such column/table". This mirrors those migrations with
 * SQLite types and skips the PostgreSQL-only full-text (GIN) indexes. It runs
 * once per process and is a no-op on PostgreSQL.
 */
import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import { ensureColumn } from '@/lib/db/schema-helpers.js';
import { ensureRetailPricingSchema } from '@/lib/retail-pricing.js';
import { ensureProductVariantsSchema } from '@/lib/product-variants.js';
import { ensureProductCatalogSchema } from '@/lib/product-catalog.js';

const ensured = new WeakMap();

export function ensureRetailCommerceSchema(db) {
  if (!db || db.driver === 'postgres') return Promise.resolve();
  if (!ensured.has(db)) ensured.set(db, createSqliteCommerceSchema(db).catch((error) => { ensured.delete(db); throw error; }));
  return ensured.get(db);
}

async function createSqliteCommerceSchema(db) {
  // Base catalog tables first, so the columns below have tables to extend.
  await ensureProductVariantsSchema(db);
  await ensureProductCatalogSchema(db);
  await ensureRetailPricingSchema(db);
  const columns = [
    ['products', 'merchandising_type', "TEXT NOT NULL DEFAULT 'simple'"],
    ['products', 'online_title', 'TEXT'],
    ['products', 'online_description', 'TEXT'],
    ['products', 'online_summary', 'TEXT'],
    ['products', 'online_slug', 'TEXT'],
    ['products', 'seo_title', 'TEXT'],
    ['products', 'seo_description', 'TEXT'],
    ['products', 'online_enabled', 'INTEGER NOT NULL DEFAULT 1'],
    ['products', 'featured', 'INTEGER NOT NULL DEFAULT 0'],
    ['products', 'online_sort', 'INTEGER NOT NULL DEFAULT 0'],
    ['products', 'online_category_id', 'INTEGER'],
    ['product_variants', 'merchandising_signature', 'TEXT'],
    ['product_variants', 'purchase_cost', 'NUMERIC(14,2)'],
    ['product_variants', 'weight', 'NUMERIC(14,3)'],
    ['product_attribute_values', 'short_code', 'TEXT'],
    ['product_attribute_values', 'swatch', 'TEXT'],
    ['product_attributes', 'online_filter', 'INTEGER NOT NULL DEFAULT 0'],
    ['product_categories', 'merchandising_active', 'INTEGER NOT NULL DEFAULT 1'],
    ['product_categories', 'online_enabled', 'INTEGER NOT NULL DEFAULT 1'],
    ['product_categories', 'image_url', 'TEXT'],
  ];
  for (const [table, column, type] of columns) await ensureColumn(db, table, column, type);

  const tables = [
    `CREATE TABLE IF NOT EXISTS retail_brands (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1, description TEXT, logo_url TEXT)`,
    `CREATE TABLE IF NOT EXISTS retail_product_media (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL,
      variant_id INTEGER, url TEXT NOT NULL, alt TEXT NOT NULL DEFAULT '', display_order INTEGER NOT NULL DEFAULT 0,
      is_primary INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS retail_supplier_skus (id INTEGER PRIMARY KEY AUTOINCREMENT, variant_id INTEGER NOT NULL,
      supplier_id INTEGER NOT NULL, supplier_sku TEXT, supplier_barcode TEXT, minimum_order_quantity NUMERIC(14,3),
      preferred INTEGER NOT NULL DEFAULT 0, UNIQUE(variant_id, supplier_id))`,
    `CREATE TABLE IF NOT EXISTS retail_price_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, actor_id INTEGER,
      source_id INTEGER, before_json TEXT, after_json TEXT, reason TEXT, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS retail_catalog_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, created_by INTEGER NOT NULL,
      payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PREVIEW', result_json TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, applied_at DATETIME)`,
    `CREATE TABLE IF NOT EXISTS retail_online_events (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, event TEXT NOT NULL,
      actor_id INTEGER, detail TEXT, notification_status TEXT NOT NULL DEFAULT 'NO_PROVIDER', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS retail_customer_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS retail_customer_invites (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE, expires_at DATETIME NOT NULL, used_at DATETIME, created_by INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS retail_customer_sessions (token_hash TEXT PRIMARY KEY, account_id INTEGER NOT NULL, expires_at DATETIME NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS retail_public_limits (bucket TEXT PRIMARY KEY, window_start INTEGER NOT NULL, hits INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS retail_online_settings (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0,
      store_name TEXT NOT NULL DEFAULT 'Aadhar Store',
      pickup_instructions TEXT NOT NULL DEFAULT 'Collect from our store after your order is ready.',
      delivery_enabled INTEGER NOT NULL DEFAULT 0, delivery_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
      free_delivery_threshold NUMERIC(14,2), reservation_minutes INTEGER NOT NULL DEFAULT 120,
      payment_instructions TEXT NOT NULL DEFAULT '', manual_payment_enabled INTEGER NOT NULL DEFAULT 0,
      return_policy TEXT NOT NULL DEFAULT 'Contact the store with your order number for a return or exchange.')`,
  ];
  for (const sql of tables) await ensureSqliteTable(db, sql);
  for (const [column, type] of [
    ['brand_color', "TEXT NOT NULL DEFAULT '#20372e'"], ['logo_url', 'TEXT'], ['contact_text', "TEXT NOT NULL DEFAULT ''"],
    ['hero_text', "TEXT NOT NULL DEFAULT 'Thoughtfully selected essentials. A little discovery in every visit.'"],
    ['guest_enabled', 'INTEGER NOT NULL DEFAULT 1'],
  ]) await ensureColumn(db, 'retail_online_settings', column, type);
  await db.run('INSERT OR IGNORE INTO retail_online_settings (id) VALUES (1)');
  await db.run('INSERT OR IGNORE INTO retail_margin_policy (id) VALUES (1)');
  await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_product_online_slug ON products(online_slug) WHERE online_slug IS NOT NULL');
  await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_variant_merchandising_signature ON product_variants(product_id, merchandising_signature) WHERE merchandising_signature IS NOT NULL');
}
