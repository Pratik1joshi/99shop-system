import { ensureRetailPurchasingSchema } from '@/lib/retail-purchasing.js';
import { ensureRetailReservationSchema } from '@/lib/retail-reservations.js';
import { ensureRetailSerialsSchema } from '@/lib/retail-serials.js';
import { ensureProductCatalogSchema } from '@/lib/product-catalog.js';

const pageNumber = (value) => Math.max(1, Math.min(10000, Math.trunc(Number(value)) || 1));
const pageSize = (value, max = 100) => Math.max(1, Math.min(max, Math.trunc(Number(value)) || 40));
const like = (value) => `%${String(value).toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;

export async function queryRetailStock(db, options = {}) {
  await ensureRetailPurchasingSchema(db);
  await ensureRetailReservationSchema(db);
  await ensureRetailSerialsSchema(db);
  await ensureProductCatalogSchema(db);
  const page = pageNumber(options.page);
  const size = pageSize(options.pageSize, options.productId ? 250 : 100);
  const query = String(options.query || '').trim().slice(0, 120);
  const locationId = Number(options.locationId) || null;
  const productId = Number(options.productId) || null;
  const state = String(options.state || '').toUpperCase();
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const cte = `WITH stock AS (
    SELECT b.variant_id,b.location_id,SUM(b.quantity_on_hand) AS on_hand,
      SUM(CASE WHEN loc.is_sellable=1 AND (ib.id IS NULL OR (ib.status='active' AND (ib.expiry_date IS NULL OR ib.expiry_date>=?))) THEN b.quantity_on_hand ELSE 0 END) AS sellable,
      SUM(CASE WHEN ib.expiry_date<? THEN b.quantity_on_hand ELSE 0 END) AS expired,
      SUM(CASE WHEN ib.expiry_date>=? AND ib.expiry_date<=? THEN b.quantity_on_hand ELSE 0 END) AS expiring
    FROM inventory_balances b JOIN inventory_locations loc ON loc.id=b.location_id
    LEFT JOIN inventory_batches ib ON ib.id=b.batch_id
    GROUP BY b.variant_id,b.location_id
  ), reservations AS (
    SELECT variant_id,location_id,SUM(quantity) AS reserved FROM inventory_reservations WHERE status='ACTIVE' AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP) GROUP BY variant_id,location_id
  ), incoming AS (
    SELECT pol.variant_id,po.location_id,SUM(pol.ordered_quantity-pol.quantity_received) AS quantity
    FROM purchase_order_lines pol JOIN purchase_orders po ON po.id=pol.purchase_order_id
    WHERE po.status IN ('APPROVED','PARTIALLY_RECEIVED') AND pol.ordered_quantity>pol.quantity_received
    GROUP BY pol.variant_id,po.location_id
  ), base AS (
    SELECT v.id AS variant_id,p.id AS product_id,p.name AS product_name,v.variant_name,v.sku,v.tracking_mode,
      p.brand,c.name AS category_name,loc.id AS location_id,loc.name AS location_name,loc.code AS location_code,
      COALESCE(stock.on_hand,0) AS on_hand,COALESCE(stock.sellable,0) AS sellable,
      COALESCE(reservations.reserved,0) AS reserved,
      COALESCE(incoming.quantity,0) AS incoming,
      COALESCE(v.reorder_point,0) AS reorder_point,COALESCE(v.reorder_quantity,0) AS reorder_quantity,
      COALESCE(stock.expiring,0) AS expiring,COALESCE(stock.expired,0) AS expired
    FROM menu_item_variants v JOIN menu_items p ON p.id=v.menu_item_id
    LEFT JOIN menu_categories c ON c.id=p.category_id
    JOIN inventory_locations loc ON loc.is_active=1
    LEFT JOIN stock ON stock.variant_id=v.id AND stock.location_id=loc.id
    LEFT JOIN reservations ON reservations.variant_id=v.id AND reservations.location_id=loc.id
    LEFT JOIN incoming ON incoming.variant_id=v.id AND incoming.location_id=loc.id
    WHERE (loc.is_default=1 OR COALESCE(stock.on_hand,0)<>0 OR COALESCE(incoming.quantity,0)>0${productId ? ' OR 1=1' : ''})
  )`;
  const params = [today, today, today, soon];
  const where = [];
  if (locationId) { where.push('base.location_id=?'); params.push(locationId); }
  if (productId) { where.push('base.product_id=?'); params.push(productId); }
  if (query) {
    const pattern = like(query);
    where.push(`(lower(base.product_name) LIKE ? ESCAPE '\\' OR lower(COALESCE(base.variant_name,'')) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(base.sku,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(base.brand,'')) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(base.category_name,'')) LIKE ? ESCAPE '\\' OR lower(base.location_name) LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM product_barcodes pb WHERE pb.variant_id=base.variant_id AND lower(pb.barcode) LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM inventory_serials ser WHERE ser.variant_id=base.variant_id AND lower(ser.serial_number) LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM inventory_batches bat WHERE bat.variant_id=base.variant_id AND lower(bat.batch_number) LIKE ? ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM inventory_batches bat JOIN suppliers sup ON sup.id=bat.supplier_id WHERE bat.variant_id=base.variant_id AND lower(sup.name) LIKE ? ESCAPE '\\'))`);
    params.push(...Array(10).fill(pattern));
  }
  const available = '(base.sellable-base.reserved)';
  const states = {
    LOW: `${available}>0 AND ${available}<=base.reorder_point AND base.reorder_point>0`,
    OUT: `${available}<=0 AND base.location_code NOT IN ('QUARANTINE','IN_TRANSIT')`,
    EXPIRING: 'base.expiring>0', EXPIRED: 'base.expired>0',
    QUARANTINED: "base.location_code='QUARANTINE' AND base.on_hand>0",
    IN_TRANSIT: "base.location_code='IN_TRANSIT' AND base.on_hand>0",
    INCOMING: 'base.incoming>0',
  };
  const summaryFilter = where.length ? `WHERE ${where.join(' AND ')}` : '';
  if (states[state]) where.push(`(${states[state]})`);
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
  if (options.groupByProduct) {
    const selected = `${cte}, selected AS (SELECT DISTINCT base.product_id FROM base ${filter})`;
    const groupLocation = locationId ? 'WHERE base.location_id=?' : '';
    const groupParams = locationId ? [...params, locationId] : params;
    const costColumn = options.showCost ? `,SUM(COALESCE((SELECT SUM(iv.allocated_value) FROM inventory_balance_valuation iv WHERE iv.variant_id=base.variant_id AND iv.location_id=base.location_id),0)) AS inventory_value` : '';
    const summary = await db.get(`${cte} SELECT COUNT(DISTINCT base.product_id) AS total,
      COUNT(DISTINCT CASE WHEN ${states.LOW} THEN base.product_id END) AS low_count,
      COUNT(DISTINCT CASE WHEN ${states.OUT} THEN base.product_id END) AS out_count,
      COUNT(DISTINCT CASE WHEN ${states.EXPIRING} THEN base.product_id END) AS expiring_count,
      COUNT(DISTINCT CASE WHEN ${states.QUARANTINED} THEN base.product_id END) AS quarantined_count,
      COUNT(DISTINCT CASE WHEN ${states.IN_TRANSIT} THEN base.product_id END) AS transit_count,
      COUNT(DISTINCT CASE WHEN ${states.INCOMING} THEN base.product_id END) AS incoming_count
      FROM base ${summaryFilter}`, params);
    const total = Number((await db.get(`${selected} SELECT COUNT(*) AS total FROM selected`, params))?.total || 0);
    const order = options.sort === 'available' ? 'available ASC,product_name' : options.sort === 'incoming' ? 'incoming DESC,product_name' : 'product_name';
    const rows = await db.all(`${selected} SELECT base.product_id,MAX(base.product_name) AS product_name,
      MAX(base.brand) AS brand,MAX(base.category_name) AS category_name,
      COUNT(DISTINCT base.variant_id) AS variant_count,COUNT(DISTINCT base.location_id) AS location_count,
      SUM(base.on_hand) AS on_hand,SUM(base.reserved) AS reserved,
      SUM(CASE WHEN base.sellable>base.reserved THEN base.sellable-base.reserved ELSE 0 END) AS available,
      SUM(base.incoming) AS incoming,
      SUM(CASE WHEN ${states.LOW} THEN 1 ELSE 0 END) AS low_count,
      SUM(CASE WHEN ${states.OUT} THEN 1 ELSE 0 END) AS out_count,
      SUM(CASE WHEN ${states.EXPIRING} THEN 1 ELSE 0 END) AS expiring_count,
      SUM(CASE WHEN ${states.QUARANTINED} THEN 1 ELSE 0 END) AS quarantined_count,
      SUM(CASE WHEN ${states.IN_TRANSIT} THEN 1 ELSE 0 END) AS transit_count${costColumn}
      FROM base JOIN selected ON selected.product_id=base.product_id ${groupLocation}
      GROUP BY base.product_id ORDER BY ${order} LIMIT ? OFFSET ?`, [...groupParams, size, (page - 1) * size]);
    return { rows, summary, pagination: { page, page_size: size, total, total_pages: Math.max(1, Math.ceil(total / size)) } };
  }
  const summary = await db.get(`${cte} SELECT COUNT(*) AS total,
    SUM(CASE WHEN ${states.LOW} THEN 1 ELSE 0 END) AS low_count,
    SUM(CASE WHEN ${states.OUT} THEN 1 ELSE 0 END) AS out_count,
    SUM(CASE WHEN ${states.EXPIRING} THEN 1 ELSE 0 END) AS expiring_count,
    SUM(CASE WHEN ${states.QUARANTINED} THEN 1 ELSE 0 END) AS quarantined_count,
    SUM(CASE WHEN ${states.IN_TRANSIT} THEN 1 ELSE 0 END) AS transit_count,
    SUM(CASE WHEN ${states.INCOMING} THEN 1 ELSE 0 END) AS incoming_count
    FROM base ${summaryFilter}`, params);
  const total = states[state] ? Number((await db.get(`${cte} SELECT COUNT(*) AS total FROM base ${filter}`, params))?.total || 0) : Number(summary?.total || 0);
  const order = options.sort === 'available' ? `${available} ASC,base.product_name,base.variant_id` :
    options.sort === 'incoming' ? 'base.incoming DESC,base.product_name,base.variant_id' :
    'base.product_name,base.variant_name,base.location_name,base.variant_id';
  const costJoin = options.showCost ? 'LEFT JOIN inventory_costs cost ON cost.variant_id=base.variant_id' : '';
  const costColumns = options.showCost ? ',cost.average_cost AS current_cost,COALESCE((SELECT SUM(iv.allocated_value) FROM inventory_balance_valuation iv WHERE iv.variant_id=base.variant_id AND iv.location_id=base.location_id),0) AS inventory_value' : '';
  const rows = await db.all(`${cte} SELECT base.*${costColumns} FROM base ${costJoin} ${filter} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, size, (page - 1) * size]);
  return { rows: rows.map((row) => ({ ...row, available: Math.max(0, Number(row.sellable) - Number(row.reserved)) })),
    summary, pagination: { page, page_size: size, total, total_pages: Math.max(1, Math.ceil(total / size)) } };
}
