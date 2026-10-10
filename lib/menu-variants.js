import { ensureColumn } from '@/lib/db/schema-helpers.js';

let ENSURED = false;

export async function ensureMenuVariantsSchema(db) {
  if (ENSURED) return;
  await ensureColumn(db, 'menu_item_variants', 'price', 'REAL');
  await ensureColumn(db, 'menu_item_variants', 'stock_unit', 'TEXT');
  await ensureColumn(db, 'menu_items', 'unit', 'TEXT');
  await ensureColumn(db, 'menu_items', 'cost', 'NUMERIC(14,2)');
  await ensureColumn(db, 'menu_items', 'barcode', 'TEXT');
  await ensureColumn(db, 'menu_item_variants', 'barcode', 'TEXT');
  // Inventory, purchasing and sales are SKU/variant keyed, so every product
  // without options gets one stable sellable SKU.
  await db.run(`
    INSERT INTO menu_item_variants
      (menu_item_id, variant_name, price_modifier, is_default, price, stock_unit, barcode)
    SELECT mi.id, 'Standard', 0, 1, mi.base_price, mi.unit, NULL
      FROM menu_items mi
     WHERE NOT EXISTS (
         SELECT 1 FROM menu_item_variants v WHERE v.menu_item_id = mi.id
       )
  `);
  ENSURED = true;
}

/** Preserve the stable SKU id used by retail history when a product has no options. */
export async function ensureStandardVariant(db, menuItemId, { price, stockUnit = null } = {}) {
  const existing = await db.all(
    'SELECT * FROM menu_item_variants WHERE menu_item_id = ? ORDER BY is_default DESC, id',
    [menuItemId]
  );
  if (existing.length > 1) {
    throw Object.assign(new Error('This product has multiple variants. Edit the variants instead of turning them off, so existing stock and sales history stay linked.'), { status: 409 });
  }
  if (existing.length === 1) {
    await db.run(
      `UPDATE menu_item_variants
          SET variant_name = 'Standard', price = ?, price_modifier = 0,
              stock_unit = COALESCE(?, stock_unit), is_default = 1
        WHERE id = ?`,
      [Number(price) || 0, stockUnit || null, existing[0].id]
    );
    return db.all('SELECT * FROM menu_item_variants WHERE menu_item_id = ?', [menuItemId]);
  }
  await db.run(
    `INSERT INTO menu_item_variants
      (menu_item_id, variant_name, price_modifier, is_default, price, stock_unit, barcode)
     VALUES (?, 'Standard', 0, 1, ?, ?, NULL)`,
    [menuItemId, Number(price) || 0, stockUnit || null]
  );
  return db.all('SELECT * FROM menu_item_variants WHERE menu_item_id = ?', [menuItemId]);
}

export async function getVariantsByMenuItemIds(db, menuItemIds) {
  if (!menuItemIds.length) return new Map();
  const placeholders = menuItemIds.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT v.*, COALESCE(v.price, mi.base_price + COALESCE(v.price_modifier, 0)) AS price
     FROM menu_item_variants v
     JOIN menu_items mi ON mi.id = v.menu_item_id
     WHERE v.menu_item_id IN (${placeholders})
     ORDER BY v.is_default DESC, v.id`,
    menuItemIds
  );
  const byItem = new Map();
  for (const row of rows) {
    const list = byItem.get(row.menu_item_id) || [];
    list.push(row);
    byItem.set(row.menu_item_id, list);
  }
  return byItem;
}

/**
 * A scan must resolve to exactly one sellable thing, so products and variants
 * share a single barcode namespace. Checked up front because the DB's unique
 * violation reaches the operator as an unhelpful masked 500 — and because
 * SQLite dev databases upgraded via ALTER TABLE cannot carry the unique index
 * that migration 071 adds on Postgres, leaving this the only guard there.
 */
export async function findBarcodeConflict(db, barcodes, excludeMenuItemId = null) {
  const codes = (barcodes || []).filter(Boolean);
  if (!codes.length) return null;

  const seen = new Set();
  for (const code of codes) {
    if (seen.has(code)) return code;
    seen.add(code);
  }

  const unique = [...seen];
  const placeholders = unique.map(() => '?').join(',');
  const exclude = excludeMenuItemId ? Number(excludeMenuItemId) : -1;
  const row = await db.get(
    `SELECT barcode FROM menu_items WHERE barcode IN (${placeholders}) AND id <> ?
     UNION ALL
     SELECT barcode FROM menu_item_variants WHERE barcode IN (${placeholders}) AND menu_item_id <> ?
     UNION ALL
     SELECT b.barcode FROM product_barcodes b LEFT JOIN menu_item_variants v ON v.id=b.variant_id WHERE b.barcode IN (${placeholders}) AND COALESCE(v.menu_item_id,b.menu_item_id) <> ?
     LIMIT 1`,
    [...unique, exclude, ...unique, exclude,...unique,exclude]
  );
  return row ? row.barcode : null;
}
