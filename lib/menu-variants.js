import { ensureColumn } from '@/lib/db/schema-helpers.js';

let ENSURED = false;

export async function ensureMenuVariantsSchema(db) {
  if (ENSURED) return;
  await ensureColumn(db, 'menu_item_variants', 'price', 'REAL');
  await ensureColumn(db, 'menu_item_variants', 'stock_quantity', 'REAL');
  await ensureColumn(db, 'menu_item_variants', 'stock_unit', 'TEXT');
  await ensureColumn(db, 'menu_item_variants', 'inventory_item_id', 'INTEGER');
  await ensureColumn(db, 'menu_item_variants', 'pos_stock_visible', 'INTEGER DEFAULT 0');
  await ensureColumn(db, 'inventory_items', 'pos_stock_visible', 'INTEGER DEFAULT 0');
  await ensureColumn(db, 'menu_items', 'unit', 'TEXT');
  await ensureColumn(db, 'menu_items', 'cost', 'NUMERIC(14,2)');
  await ensureColumn(db, 'menu_items', 'barcode', 'TEXT');
  await ensureColumn(db, 'menu_item_variants', 'barcode', 'TEXT');
  ENSURED = true;
}

export async function getVariantsByMenuItemIds(db, menuItemIds) {
  if (!menuItemIds.length) return new Map();
  const placeholders = menuItemIds.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT v.*, COALESCE(v.price, mi.base_price + COALESCE(v.price_modifier, 0)) AS price,
            CASE WHEN COALESCE(v.pos_stock_visible, 0) = 1
                       AND COALESCE(i.is_archived, 0) = 0
                 THEN i.quantity ELSE NULL END AS pos_stock_quantity,
            CASE WHEN COALESCE(v.pos_stock_visible, 0) = 1
                       AND COALESCE(i.is_archived, 0) = 0
                 THEN i.unit ELSE NULL END AS pos_stock_unit
     FROM menu_item_variants v
     JOIN menu_items mi ON mi.id = v.menu_item_id
     LEFT JOIN inventory_items i ON i.id = v.inventory_item_id
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

// Replaces the full variant set for a menu item (delete + reinsert — the form
// always submits the complete list, there's no partial-edit case).
export function normalizeBarcode(value) {
  const code = String(value ?? '').trim();
  return code || null;
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
     LIMIT 1`,
    [...unique, exclude, ...unique, exclude]
  );
  return row ? row.barcode : null;
}

export async function replaceVariants(db, menuItemId, variants) {
  await db.run('DELETE FROM menu_item_variants WHERE menu_item_id = ?', [menuItemId]);
  const clean = (variants || [])
    .map((v) => ({
      variant_name: String(v.variant_name || '').trim(),
      price: Number(v.price),
      stock_quantity: v.stock_quantity === '' || v.stock_quantity == null ? null : Number(v.stock_quantity),
      stock_unit: v.stock_unit || null,
      inventory_item_id: v.inventory_item_id ? Number(v.inventory_item_id) : null,
      pos_stock_visible: !!v.pos_stock_visible,
      is_default: !!v.is_default,
      barcode: normalizeBarcode(v.barcode),
    }))
    .filter((v) => v.variant_name && Number.isFinite(v.price) && v.price >= 0);

  if (!clean.length) return [];

  if (!clean.some((v) => v.is_default)) clean[0].is_default = true;

  for (const v of clean) {
    await db.run(
      `INSERT INTO menu_item_variants (menu_item_id, variant_name, price, stock_quantity, stock_unit, inventory_item_id, pos_stock_visible, is_default, barcode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [menuItemId, v.variant_name, v.price, v.stock_quantity, v.stock_unit, v.inventory_item_id, v.pos_stock_visible ? 1 : 0, v.is_default ? 1 : 0, v.barcode]
    );
  }
  return clean;
}
