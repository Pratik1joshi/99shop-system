import { ensureRetailInventorySchema } from '@/lib/retail-inventory.js';

const allowedTypes = new Set(['OPENING_STOCK','PURCHASE_RECEIPT','SALE','CUSTOMER_RETURN','PURCHASE_RETURN','TRANSFER_OUT','TRANSFER_IN','STOCK_ADJUSTMENT_IN','STOCK_ADJUSTMENT_OUT','DAMAGE','EXPIRY','SHRINKAGE','TESTER','SAMPLE','INTERNAL_USE']);

export async function queryRetailMovements(db, options = {}) {
  await ensureRetailInventorySchema(db);
  const page = Math.max(1, Math.min(10000, Math.trunc(Number(options.page)) || 1));
  const size = Math.max(1, Math.min(100, Math.trunc(Number(options.pageSize)) || 40));
  const query = String(options.query || '').trim().slice(0, 120);
  const type = allowedTypes.has(options.type) ? options.type : null;
  const locationId = Number(options.locationId) || null;
  const filters = [];
  const params = [];
  if (type) { filters.push('m.movement_type=?'); params.push(type); }
  if (locationId) { filters.push('m.location_id=?'); params.push(locationId); }
  if (query) {
    const pattern = `%${query.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;
    // Match small identity tables once, rather than joining every movement to
    // products, batches and actors before counting and paginating.
    filters.push(`(m.variant_id IN (SELECT v.id FROM menu_item_variants v JOIN menu_items p ON p.id=v.menu_item_id
      WHERE lower(p.name) LIKE ? ESCAPE '\\' OR lower(COALESCE(v.sku,'')) LIKE ? ESCAPE '\\')
      OR m.batch_id IN (SELECT b.id FROM inventory_batches b WHERE lower(COALESCE(b.batch_number,'')) LIKE ? ESCAPE '\\')
      OR lower(COALESCE(m.reference_type,'')) LIKE ? ESCAPE '\\')`);
    params.push(pattern, pattern, pattern, pattern);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const from = `FROM (SELECT * FROM inventory_movements m ${where} ORDER BY m.id DESC LIMIT ? OFFSET ?) m JOIN menu_item_variants v ON v.id=m.variant_id
    JOIN menu_items p ON p.id=v.menu_item_id JOIN inventory_locations l ON l.id=m.location_id
    LEFT JOIN inventory_batches b ON b.id=m.batch_id LEFT JOIN users u ON u.id=m.created_by`;
  const count = await db.get(`SELECT COUNT(*) AS total FROM inventory_movements m ${where}`, params);
  const costColumns = options.showCost ? ',m.unit_cost,m.total_cost' : '';
  const rows = await db.all(`SELECT m.id,m.created_at,m.variant_id,m.location_id,m.batch_id,m.movement_type,m.quantity,
    m.balance_after,(m.balance_after-m.quantity) AS balance_before,m.reference_type,m.reference_id,m.reason,
    p.id AS product_id,p.name AS product_name,v.variant_name,v.sku,l.name AS location_name,b.batch_number,u.full_name AS actor
    ${costColumns} ${from} ORDER BY m.id DESC`, [...params, size, (page - 1) * size]);
  return { rows, pagination: { page, page_size: size, total: Number(count?.total || 0), total_pages: Math.max(1, Math.ceil(Number(count?.total || 0) / size)) } };
}
