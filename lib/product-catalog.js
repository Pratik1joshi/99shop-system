import { ensureColumn } from '@/lib/db/schema-helpers.js';
import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import { shopBarcode } from '@/lib/shop-barcode.js';

let ENSURED = false;

export async function ensureProductCatalogSchema(db) {
  if (ENSURED) return;

  await ensureSqliteTable(
    db,
    `CREATE TABLE IF NOT EXISTS product_barcodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
      variant_id INTEGER REFERENCES menu_item_variants(id) ON DELETE CASCADE,
      barcode TEXT NOT NULL UNIQUE,
      barcode_type TEXT NOT NULL DEFAULT 'primary',
      is_primary INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await ensureSqliteTable(
    db,
    `CREATE TABLE IF NOT EXISTS product_attributes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await ensureSqliteTable(
    db,
    `CREATE TABLE IF NOT EXISTS product_attribute_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attribute_id INTEGER NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
      value TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      UNIQUE(attribute_id, value)
    )`
  );
  await ensureSqliteTable(
    db,
    `CREATE TABLE IF NOT EXISTS variant_attribute_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id) ON DELETE CASCADE,
      attribute_id INTEGER NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
      attribute_value_id INTEGER NOT NULL REFERENCES product_attribute_values(id) ON DELETE CASCADE,
      UNIQUE(variant_id, attribute_id)
    )`
  );

  await ensureColumn(db, 'menu_item_variants', 'sku', 'TEXT');
  await ensureColumn(db, 'menu_item_variants', 'mrp', 'NUMERIC(14,2)');
  await ensureColumn(db, 'menu_item_variants', 'wholesale_price', 'NUMERIC(14,2)');
  await ensureColumn(db, 'menu_item_variants', 'merchandising_active', 'INTEGER DEFAULT 1');
  await ensureColumn(db, 'menu_item_variants', 'tax_category', 'TEXT');
  await ensureColumn(db, 'menu_items', 'sku', 'TEXT');
  await ensureColumn(db, 'menu_items', 'brand', 'TEXT');

  ENSURED = true;
}

/** Every barcode a variant or product carries, extra codes first-class alongside the legacy primary column. */
export async function getBarcodesFor(db, { menuItemId = null, variantId = null }) {
  await ensureProductCatalogSchema(db);
  if (variantId) {
    return db.all(
      `SELECT * FROM product_barcodes WHERE variant_id = ? ORDER BY is_primary DESC, id`,
      [variantId]
    );
  }
  return db.all(
    `SELECT * FROM product_barcodes WHERE menu_item_id = ? ORDER BY is_primary DESC, id`,
    [menuItemId]
  );
}

/**
 * Resolve one scanned code to the product/variant it belongs to, checking the
 * new multi-barcode table first (covers manufacturer/supplier/alternate
 * codes) and falling back to the legacy single-barcode columns so rows added
 * before this table existed still scan.
 */
export async function findByBarcode(db, code) {
  await ensureProductCatalogSchema(db);
  const barcode = String(code ?? '').trim();
  if (!barcode) return null;

  const mapped = await db.get(`SELECT * FROM product_barcodes WHERE barcode = ?`, [barcode]);
  if (mapped) {
    return mapped.variant_id
      ? { menuItemId: null, variantId: mapped.variant_id }
      : { menuItemId: mapped.menu_item_id, variantId: null };
  }

  const item = await db.get(`SELECT id FROM menu_items WHERE barcode = ?`, [barcode]);
  if (item) return { menuItemId: item.id, variantId: null };

  const variant = await db.get(`SELECT id, menu_item_id FROM menu_item_variants WHERE barcode = ?`, [barcode]);
  if (variant) return { menuItemId: null, variantId: variant.id };

  return null;
}

export async function addBarcode(db, { menuItemId = null, variantId = null, barcode, barcodeType = 'other' }) {
  await ensureProductCatalogSchema(db);
  const code = String(barcode ?? '').trim();
  if (!code) throw new Error('Barcode required');
  if (!menuItemId && !variantId) throw new Error('menuItemId or variantId required');

  const existing = await findByBarcode(db, code);
  if (existing) throw new Error(`Barcode ${code} already in use`);

  await db.run(
    `INSERT INTO product_barcodes (menu_item_id, variant_id, barcode, barcode_type, is_primary)
     VALUES (?, ?, ?, ?, 0)`,
    [menuItemId, variantId, code, barcodeType]
  );
}

export async function removeBarcode(db, id) {
  await db.run(`DELETE FROM product_barcodes WHERE id = ? AND is_primary = 0`, [id]);
}

/** The shop's own number barcode, in GS1's in-store 2xx range (see lib/shop-barcode.js). */
export function generateInternalBarcode() {
  return shopBarcode();
}

export async function listAttributes(db) {
  await ensureProductCatalogSchema(db);
  const attributes = await db.all(`SELECT * FROM product_attributes ORDER BY display_order, name`);
  const values = await db.all(`SELECT * FROM product_attribute_values ORDER BY display_order, value`);
  const byAttribute = new Map();
  for (const v of values) {
    const list = byAttribute.get(v.attribute_id) || [];
    list.push(v);
    byAttribute.set(v.attribute_id, list);
  }
  return attributes.map((a) => ({ ...a, values: byAttribute.get(a.id) || [] }));
}

export async function ensureAttribute(db, name) {
  await ensureProductCatalogSchema(db);
  const clean = String(name || '').trim();
  if (!clean) throw new Error('Attribute name required');
  const existing = await db.get(`SELECT * FROM product_attributes WHERE name = ?`, [clean]);
  if (existing) return existing;
  await db.run(`INSERT INTO product_attributes (name) VALUES (?)`, [clean]);
  return db.get(`SELECT * FROM product_attributes WHERE name = ?`, [clean]);
}

export async function ensureAttributeValue(db, attributeId, value) {
  const clean = String(value || '').trim();
  if (!clean) throw new Error('Attribute value required');
  const existing = await db.get(
    `SELECT * FROM product_attribute_values WHERE attribute_id = ? AND value = ?`,
    [attributeId, clean]
  );
  if (existing) return existing;
  await db.run(`INSERT INTO product_attribute_values (attribute_id, value) VALUES (?, ?)`, [attributeId, clean]);
  return db.get(`SELECT * FROM product_attribute_values WHERE attribute_id = ? AND value = ?`, [attributeId, clean]);
}

/** Replaces this variant's full attribute set (name -> value strings), creating attributes/values on the fly. */
export async function setVariantAttributes(db, variantId, attributeMap) {
  await ensureProductCatalogSchema(db);
  await db.run(`DELETE FROM variant_attribute_values WHERE variant_id = ?`, [variantId]);
  for (const [name, value] of Object.entries(attributeMap || {})) {
    if (!String(value ?? '').trim()) continue;
    const attribute = await ensureAttribute(db, name);
    const attributeValue = await ensureAttributeValue(db, attribute.id, value);
    await db.run(
      `INSERT INTO variant_attribute_values (variant_id, attribute_id, attribute_value_id) VALUES (?, ?, ?)`,
      [variantId, attribute.id, attributeValue.id]
    );
  }
}

// Rows in these tables describe the catalogue item itself, so they go with it.
// Every other table that points at a product or SKU is history (sales, stock,
// purchases, warranty...) and keeps the item from being deleted.
const VARIANT_SETTINGS = new Set(['variant_attribute_values', 'product_barcodes', 'retail_price_list_items', 'retail_product_media', 'retail_supplier_skus', 'operations_policies']);
const PRODUCT_SETTINGS = new Set(['menu_item_variants', 'product_barcodes', 'retail_price_list_items', 'retail_product_media', 'recipes', 'inventory_items']);
const VARIANT_REF = /(^|_)variant_id$/;
const PRODUCT_REF = /^(menu_item_id|product_id|component_menu_item_id)$/;

/**
 * Every table/column that may hold a product or SKU id. Discovered from the live
 * schema because SQLite installs carry many of these columns without a foreign
 * key (and inventory_movements cascades), so FK errors cannot be trusted to
 * protect history.
 */
async function referencingColumns(db, pattern) {
  const rows = db.driver === 'postgres'
    ? await db.all(`SELECT c.table_name AS t, c.column_name AS c FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = current_schema() AND t.table_type = 'BASE TABLE'`)
    : await db.all(`SELECT m.name AS t, p.name AS c FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type = 'table'`);
  return rows.filter((row) => pattern.test(row.c));
}

async function usedIn(db, refs, settings, ids) {
  if (!ids.length) return false;
  const list = ids.map(() => '?').join(',');
  for (const { t, c } of refs) {
    if (settings.has(t)) continue;
    if (await db.get(`SELECT 1 AS used FROM "${t}" WHERE "${c}" IN (${list}) LIMIT 1`, ids)) return true;
  }
  return false;
}

async function clearSettings(db, refs, settings, ids) {
  if (!ids.length) return;
  const list = ids.map(() => '?').join(',');
  for (const { t, c } of refs) {
    if (!settings.has(t) || t === 'menu_item_variants') continue;
    if (t === 'inventory_items') await db.run(`UPDATE inventory_items SET menu_item_id = NULL WHERE "${c}" IN (${list})`, ids);
    else await db.run(`DELETE FROM "${t}" WHERE "${c}" IN (${list})`, ids);
  }
}

/**
 * Removes one SKU. Never-used SKUs are deleted; SKUs with any history are
 * switched off instead, so past sales, stock and reports stay intact.
 * Returns 'deleted' or 'archived'. Run inside a transaction.
 */
export async function removeVariant(db, variantId) {
  const refs = await referencingColumns(db, VARIANT_REF);
  // Hiding a SKU that still holds stock would strand that stock out of sight.
  const onHand = refs.some((r) => r.t === 'inventory_balances')
    ? Number((await db.get('SELECT COALESCE(SUM(quantity_on_hand), 0) AS q FROM inventory_balances WHERE variant_id = ?', [variantId])).q) : 0;
  if (onHand !== 0) {
    const row = await db.get('SELECT variant_name FROM menu_item_variants WHERE id = ?', [variantId]);
    throw Object.assign(new Error(`“${row?.variant_name || 'This version'}” still has ${onHand} in stock. Adjust its stock to 0 (or move it to another version) first, then remove it.`), { status: 409 });
  }
  if (await usedIn(db, refs, VARIANT_SETTINGS, [variantId])) {
    await db.run('UPDATE menu_item_variants SET merchandising_active = 0, is_default = 0 WHERE id = ?', [variantId]);
    return 'archived';
  }
  await clearSettings(db, refs, VARIANT_SETTINGS, [variantId]);
  await db.run('DELETE FROM menu_item_variants WHERE id = ?', [variantId]);
  return 'deleted';
}

/**
 * Deletes a product with no history; otherwise takes it off sale everywhere
 * (Billing and the online store) and keeps it for reports.
 * Returns 'deleted' or 'archived'. Run inside a transaction.
 */
export async function deleteProduct(db, productId) {
  const variantIds = (await db.all('SELECT id FROM menu_item_variants WHERE menu_item_id = ?', [productId])).map((v) => Number(v.id));
  const variantRefs = await referencingColumns(db, VARIANT_REF);
  const productRefs = await referencingColumns(db, PRODUCT_REF);
  if (await usedIn(db, productRefs, PRODUCT_SETTINGS, [productId]) || await usedIn(db, variantRefs, VARIANT_SETTINGS, variantIds)) {
    await db.run('UPDATE menu_items SET is_available = 0, online_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [productId]);
    return 'archived';
  }
  await clearSettings(db, variantRefs, VARIANT_SETTINGS, variantIds);
  await db.run('DELETE FROM menu_item_variants WHERE menu_item_id = ?', [productId]);
  await clearSettings(db, productRefs, PRODUCT_SETTINGS, [productId]);
  await db.run('DELETE FROM menu_items WHERE id = ?', [productId]);
  return 'deleted';
}

export async function getVariantAttributes(db, variantId) {
  await ensureProductCatalogSchema(db);
  return db.all(
    `SELECT a.name AS attribute, v.value
     FROM variant_attribute_values vav
     JOIN product_attributes a ON a.id = vav.attribute_id
     JOIN product_attribute_values v ON v.id = vav.attribute_value_id
     WHERE vav.variant_id = ?
     ORDER BY a.display_order, a.name`,
    [variantId]
  );
}
