import { ensureColumn } from '@/lib/db/schema-helpers.js';

let ENSURED = false;

export async function ensureMenuVariantsSchema(db) {
  if (ENSURED) return;
  await ensureColumn(db, 'menu_item_variants', 'price', 'REAL');
  await ensureColumn(db, 'menu_item_variants', 'stock_quantity', 'REAL');
  await ensureColumn(db, 'menu_item_variants', 'stock_unit', 'TEXT');
  await ensureColumn(db, 'menu_item_variants', 'inventory_item_id', 'INTEGER');
  await ensureColumn(db, 'menu_item_variants', 'pos_stock_visible', 'INTEGER DEFAULT 0');
  await ensureColumn(db, 'menu_items', 'unit', 'TEXT');
  await ensureColumn(db, 'menu_items', 'cost', 'NUMERIC(14,2)');
  await ensureColumn(db, 'menu_items', 'barcode', 'TEXT');
  await ensureColumn(db, 'menu_item_variants', 'barcode', 'TEXT');
  // Inventory, purchasing and sales are SKU/variant keyed, so every product
  // without options gets one stable sellable SKU.
  await db.run(`
    INSERT INTO menu_item_variants
      (menu_item_id, variant_name, price_modifier, is_default, price, stock_unit, pos_stock_visible, barcode)
    SELECT mi.id, 'Standard', 0, 1, mi.base_price, mi.unit, 0, NULL
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
      (menu_item_id, variant_name, price_modifier, is_default, price, stock_unit, pos_stock_visible, barcode)
     VALUES (?, 'Standard', 0, 1, ?, ?, 0, NULL)`,
    [menuItemId, Number(price) || 0, stockUnit || null]
  );
  return db.all('SELECT * FROM menu_item_variants WHERE menu_item_id = ?', [menuItemId]);
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

// Legacy form normalization. Variant synchronization below preserves identity.
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
     UNION ALL
     SELECT b.barcode FROM product_barcodes b LEFT JOIN menu_item_variants v ON v.id=b.variant_id WHERE b.barcode IN (${placeholders}) AND COALESCE(v.menu_item_id,b.menu_item_id) <> ?
     LIMIT 1`,
    [...unique, exclude, ...unique, exclude,...unique,exclude]
  );
  return row ? row.barcode : null;
}

export async function replaceVariants(db, menuItemId, variants) {
  await ensureColumn(db,'menu_item_variants','merchandising_active','INTEGER DEFAULT 1');
  const existing=await db.all('SELECT * FROM menu_item_variants WHERE menu_item_id=?',[menuItemId]);
  const clean = (variants || [])
    .map((v) => ({
      id:v.id?Number(v.id):null,
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
  if(new Set(clean.map(v=>v.variant_name)).size!==clean.length)throw Object.assign(new Error('Variant names must be unique within this product'),{status:400});

  if (!clean.some((v) => v.is_default)) clean[0].is_default = true;

  for (const v of clean) {
    const old=v.id?existing.find(row=>Number(row.id)===v.id):existing.find(row=>row.variant_name===v.variant_name);
    if(v.id&&!old)throw Object.assign(new Error('SKU does not belong to this product'),{status:400});
    if(old){
      v.id=Number(old.id);
      await db.run('UPDATE menu_item_variants SET variant_name=?,price=?,stock_quantity=?,stock_unit=?,inventory_item_id=?,pos_stock_visible=?,is_default=?,barcode=?,merchandising_active=1 WHERE id=?',[v.variant_name,v.price,v.stock_quantity,v.stock_unit,v.inventory_item_id,v.pos_stock_visible?1:0,v.is_default?1:0,v.barcode,v.id]);
      continue;
    }
    const created=await db.run(
      `INSERT INTO menu_item_variants (menu_item_id, variant_name, price, stock_quantity, stock_unit, inventory_item_id, pos_stock_visible, is_default, barcode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [menuItemId, v.variant_name, v.price, v.stock_quantity, v.stock_unit, v.inventory_item_id, v.pos_stock_visible ? 1 : 0, v.is_default ? 1 : 0, v.barcode]
    );
    v.id=Number(created.lastInsertRowid);
  }
  const keep=new Set(clean.map(v=>v.id));
  for(const old of existing)if(!keep.has(Number(old.id)))await db.run('UPDATE menu_item_variants SET merchandising_active=0,is_default=0 WHERE id=?',[old.id]);
  return clean;
}
