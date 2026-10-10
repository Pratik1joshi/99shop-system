import { ensureRetailInventorySchema } from '@/lib/retail-inventory.js';
import { ensureRetailSerialsSchema } from '@/lib/retail-serials.js';

export async function queryRetailTracking(db, options = {}) {
  await ensureRetailInventorySchema(db);
  await ensureRetailSerialsSchema(db);
  const mode = options.mode === 'serial' ? 'serial' : 'batch';
  const query = String(options.query || '').trim().slice(0, 120);
  const locationId = Number(options.locationId) || null;
  const state = String(options.state || '').toUpperCase();
  const page = Math.max(1, Math.min(10000, Math.trunc(Number(options.page)) || 1));
  const size = Math.max(1, Math.min(100, Math.trunc(Number(options.pageSize)) || 40));
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  if (mode === 'serial') {
    const filters = [];
    const params = [];
    if (locationId) { filters.push('ser.location_id=?'); params.push(locationId); }
    if (state) { filters.push('ser.status=?'); params.push(state); }
    if (query) { const pattern = `%${query.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`; filters.push(`(lower(ser.serial_number) LIKE ? ESCAPE '\\' OR lower(p.name) LIKE ? ESCAPE '\\' OR lower(COALESCE(v.sku,'')) LIKE ? ESCAPE '\\')`); params.push(pattern,pattern,pattern); }
    const from = `FROM inventory_serials ser JOIN menu_item_variants v ON v.id=ser.variant_id JOIN menu_items p ON p.id=v.menu_item_id
      LEFT JOIN inventory_locations loc ON loc.id=ser.location_id LEFT JOIN suppliers sup ON sup.id=ser.supplier_id`;
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const count = await db.get(`SELECT COUNT(*) AS total ${from} ${where}`, params);
    const rows = await db.all(`SELECT ser.id,ser.serial_number,ser.variant_id,ser.status,ser.location_id,ser.received_at,ser.sold_at,
      ser.warranty_end_date,ser.reference_type,ser.reference_id,p.name AS product_name,p.id AS product_id,v.variant_name,v.sku,
      loc.name AS location_name,sup.name AS supplier_name${options.showCost ? ',ser.unit_cost' : ''}
      ${from} ${where} ORDER BY CASE WHEN ser.serial_number=? THEN 0 ELSE 1 END,ser.id DESC LIMIT ? OFFSET ?`, [...params, query, size, (page - 1) * size]);
    return { mode, rows, pagination: { page, page_size: size, total: Number(count?.total || 0), total_pages: Math.max(1, Math.ceil(Number(count?.total || 0) / size)) } };
  }
  const filters = ['bal.quantity_on_hand>0'];
  const params = [];
  if (locationId) { filters.push('bal.location_id=?'); params.push(locationId); }
  if (state === 'EXPIRED') { filters.push('b.expiry_date<?'); params.push(today); }
  else if (state === 'EXPIRING') { filters.push('b.expiry_date>=? AND b.expiry_date<=?'); params.push(today,until); }
  else if (state === 'QUARANTINED') filters.push("loc.code='QUARANTINE'");
  if (query) { const pattern = `%${query.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`; filters.push(`(lower(b.batch_number) LIKE ? ESCAPE '\\' OR lower(p.name) LIKE ? ESCAPE '\\' OR lower(COALESCE(v.sku,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(sup.name,'')) LIKE ? ESCAPE '\\')`); params.push(pattern,pattern,pattern,pattern); }
  const from = `FROM inventory_balance_valuation bal JOIN inventory_batches b ON b.id=bal.batch_id
    JOIN menu_item_variants v ON v.id=b.variant_id JOIN menu_items p ON p.id=v.menu_item_id
    JOIN inventory_locations loc ON loc.id=bal.location_id LEFT JOIN suppliers sup ON sup.id=b.supplier_id`;
  const where = `WHERE ${filters.join(' AND ')}`;
  const count = await db.get(`SELECT COUNT(*) AS total ${from} ${where}`, params);
  const rows = await db.all(`SELECT b.id,b.batch_number,b.variant_id,b.expiry_date,b.received_at,b.status,b.purchase_id,
    bal.location_id,bal.quantity_on_hand,p.name AS product_name,p.id AS product_id,v.variant_name,v.sku,
    loc.name AS location_name,loc.code AS location_code,sup.name AS supplier_name
    ${options.showCost ? ',b.unit_cost,bal.allocated_value AS inventory_value' : ''}
    ${from} ${where} ORDER BY CASE WHEN b.batch_number=? THEN 0 ELSE 1 END,b.expiry_date,b.id LIMIT ? OFFSET ?`, [...params, query, size, (page - 1) * size]);
  return { mode, rows, pagination: { page, page_size: size, total: Number(count?.total || 0), total_pages: Math.max(1, Math.ceil(Number(count?.total || 0) / size)) } };
}
