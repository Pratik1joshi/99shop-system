import { ensureColumn } from '@/lib/db/schema-helpers.js';

let ENSURED = false;

export async function ensureProductVariantsSchema(db) {
  if (ENSURED) return;
  await ensureColumn(db, 'product_variants', 'price', 'REAL');
  await ensureColumn(db, 'product_variants', 'stock_unit', 'TEXT');
  await ensureColumn(db, 'products', 'unit', 'TEXT');
  await ensureColumn(db, 'products', 'cost', 'NUMERIC(14,2)');
  await ensureColumn(db, 'products', 'barcode', 'TEXT');
  await ensureColumn(db, 'product_variants', 'barcode', 'TEXT');
  // Inventory, purchasing and sales are SKU/variant keyed, so every product
  // without options gets one stable sellable SKU.
  await db.run(`
    INSERT INTO product_variants
      (product_id, variant_name, price_modifier, is_default, price, stock_unit, barcode)
    SELECT mi.id, 'Standard', 0, 1, mi.base_price, mi.unit, NULL
      FROM products mi
     WHERE NOT EXISTS (
         SELECT 1 FROM product_variants v WHERE v.product_id = mi.id
       )
  `);
  ENSURED = true;
}

/** Preserve the stable SKU id used by retail history when a product has no options. */
export async function ensureStandardVariant(db, productId, { price, stockUnit = null } = {}) {
  const existing = await db.all(
    'SELECT * FROM product_variants WHERE product_id = ? ORDER BY is_default DESC, id',
    [productId]
  );
  if (existing.length > 1) {
    throw Object.assign(new Error('This product has multiple variants. Edit the variants instead of turning them off, so existing stock and sales history stay linked.'), { status: 409 });
  }
  if (existing.length === 1) {
    await db.run(
      `UPDATE product_variants
          SET variant_name = 'Standard', price = ?, price_modifier = 0,
              stock_unit = COALESCE(?, stock_unit), is_default = 1
        WHERE id = ?`,
      [Number(price) || 0, stockUnit || null, existing[0].id]
    );
    return db.all('SELECT * FROM product_variants WHERE product_id = ?', [productId]);
  }
  await db.run(
    `INSERT INTO product_variants
      (product_id, variant_name, price_modifier, is_default, price, stock_unit, barcode)
     VALUES (?, 'Standard', 0, 1, ?, ?, NULL)`,
    [productId, Number(price) || 0, stockUnit || null]
  );
  return db.all('SELECT * FROM product_variants WHERE product_id = ?', [productId]);
}

export async function getVariantsByProductIds(db, productIds) {
  if (!productIds.length) return new Map();
  const placeholders = productIds.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT v.*, COALESCE(v.price, mi.base_price + COALESCE(v.price_modifier, 0)) AS price
     FROM product_variants v
     JOIN products mi ON mi.id = v.product_id
     WHERE v.product_id IN (${placeholders})
     ORDER BY v.is_default DESC, v.id`,
    productIds
  );
  const byItem = new Map();
  for (const row of rows) {
    const list = byItem.get(row.product_id) || [];
    list.push(row);
    byItem.set(row.product_id, list);
  }
  return byItem;
}

/**
 * A scan must resolve to exactly one sellable thing, so products and variants
 * share a single barcode namespace. Checked up front because the DB's unique
 * violation reaches the operator as an unhelpful masked 500 — and because
 * SQLite dev databases upgraded via ALTER TABLE cannot carry the unique index
 * that the schema migration adds on Postgres, leaving this the only guard there.
 */
export async function findBarcodeConflict(db, barcodes, excludeProductId = null) {
  const codes = (barcodes || []).filter(Boolean);
  if (!codes.length) return null;

  const seen = new Set();
  for (const code of codes) {
    if (seen.has(code)) return code;
    seen.add(code);
  }

  const unique = [...seen];
  const placeholders = unique.map(() => '?').join(',');
  const exclude = excludeProductId ? Number(excludeProductId) : -1;
  const row = await db.get(
    `SELECT barcode FROM products WHERE barcode IN (${placeholders}) AND id <> ?
     UNION ALL
     SELECT barcode FROM product_variants WHERE barcode IN (${placeholders}) AND product_id <> ?
     UNION ALL
     SELECT b.barcode FROM product_barcodes b LEFT JOIN product_variants v ON v.id=b.variant_id WHERE b.barcode IN (${placeholders}) AND COALESCE(v.product_id,b.product_id) <> ?
     LIMIT 1`,
    [...unique, exclude, ...unique, exclude,...unique,exclude]
  );
  return row ? row.barcode : null;
}
