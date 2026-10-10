import { findByBarcode } from '@/lib/product-catalog.js';
import { getDefaultLocation, getSellableStockBulk } from '@/lib/retail-inventory.js';
import { ensureAfterSalesSchema } from '@/lib/retail-after-sales-schema.js';

const bounded = (value, fallback, max) => Math.min(max, Math.max(1, Math.trunc(Number(value)) || fallback));
const like = (value) => `%${value.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`;

async function searchCatalogProducts(db, { query, page, limit, active, categoryId, stockStatus, sort, prefix }) {
  const location = await getDefaultLocation(db);
  const conditions = active ? ['p.is_available = 1', 'EXISTS(SELECT 1 FROM menu_item_variants listed WHERE listed.menu_item_id = p.id AND listed.merchandising_active = 1)'] : ['1=1'];
  const params = [];
  if (Number(categoryId) > 0) { conditions.push('p.category_id = ?'); params.push(Number(categoryId)); }
  if (query) {
    const pattern = like(query);
    conditions.push(`(LOWER(p.name) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(p.brand,'')) LIKE ? ESCAPE '\\'
      OR LOWER(COALESCE(p.barcode,'')) LIKE ? ESCAPE '\\'
      OR EXISTS(SELECT 1 FROM menu_item_variants matched WHERE matched.menu_item_id = p.id AND
        (LOWER(COALESCE(matched.variant_name,'')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(matched.sku,'')) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(matched.barcode,'')) LIKE ? ESCAPE '\\'))
      OR EXISTS(SELECT 1 FROM product_barcodes pb LEFT JOIN menu_item_variants coded ON coded.id = pb.variant_id
        WHERE (pb.menu_item_id = p.id OR coded.menu_item_id = p.id) AND LOWER(pb.barcode) LIKE ? ESCAPE '\\'))`);
    params.push(...Array(7).fill(pattern));
  }
  if (['in_stock', 'out_of_stock', 'low_stock'].includes(stockStatus)) {
    const stock = `COALESCE((SELECT SUM(b.quantity_on_hand) FROM inventory_balances b JOIN inventory_locations loc ON loc.id=b.location_id
      LEFT JOIN inventory_batches ib ON ib.id=b.batch_id WHERE b.variant_id=v.id AND b.location_id=${Number(location.id)} AND loc.is_sellable=1
      AND (b.batch_id IS NULL OR (ib.status='active' AND (ib.expiry_date IS NULL OR ib.expiry_date>=CURRENT_DATE)))),0)`;
    const stocked = `EXISTS(SELECT 1 FROM menu_item_variants v WHERE v.menu_item_id=p.id ${active ? 'AND v.merchandising_active=1' : ''} AND ${stock}>0)`;
    conditions.push(stockStatus === 'out_of_stock' ? `NOT ${stocked}` : stockStatus === 'low_stock'
      ? `EXISTS(SELECT 1 FROM menu_item_variants v WHERE v.menu_item_id=p.id ${active ? 'AND v.merchandising_active=1' : ''} AND v.reorder_point>0 AND ${stock}>0 AND ${stock}<=v.reorder_point)` : stocked);
  }
  const rows = await db.all(`SELECT p.id,p.name AS title,p.brand,p.image_url,p.is_available,p.barcode,c.name AS category_name
    FROM menu_items p LEFT JOIN menu_categories c ON c.id=p.category_id
    WHERE ${conditions.join(' AND ')} ORDER BY ${sort === 'price' ? 'p.base_price,p.name' : 'p.name'},p.id LIMIT ? OFFSET ?`,
  [...params, limit + 1, (page - 1) * limit]);
  const visible = rows.slice(0, limit);
  if (!visible.length) return { key: 'catalog_products', page, has_more: rows.length > limit, results: [] };
  const variants = await db.all(`SELECT id,menu_item_id,variant_name,sku,barcode,price,mrp,tracking_mode,is_default,merchandising_active
    FROM menu_item_variants WHERE menu_item_id IN (${visible.map(() => '?').join(',')}) AND merchandising_active=1 ORDER BY is_default DESC,id`, visible.map((row) => row.id));
  const stock = await getSellableStockBulk(db, variants.map((variant) => variant.id), { locationId: location.id });
  const byProduct = new Map();
  for (const variant of variants) {
    const list = byProduct.get(Number(variant.menu_item_id)) || [];
    list.push({ ...variant, available_stock: stock[variant.id] || 0 });
    byProduct.set(Number(variant.menu_item_id), list);
  }
  return { key: 'catalog_products', page, has_more: rows.length > limit, results: visible.map((row) => {
    const options = byProduct.get(Number(row.id)) || [];
    const prices = options.map((variant) => Number(variant.price));
    return { ...row, product_id: row.id, variants: options, variant_count: options.length,
      available_stock: options.reduce((sum, variant) => sum + Number(variant.available_stock), 0),
      price: prices.length ? Math.min(...prices) : 0, price_max: prices.length ? Math.max(...prices) : 0,
      href: `${prefix}/products?product=${row.id}` };
  }) };
}

/** One bounded read model. Permissions are supplied by the authenticated server,
 * never by request parameters. Explicit projections keep sensitive fields out. */
export async function searchCommerce(db, { query = '', group = '', page = 1, limit = 6, can, prefix = '/admin', active = true, categoryId = null, brand = '', tracking = '', stockStatus = '', sort = 'name', productId = null, locationId = null } = {}) {
  query = String(query).trim().slice(0, 120);
  page = bounded(page, 1, 10000);
  limit = bounded(limit, 6, group === 'product_variants' ? 250 : 40);
  const groups = [];
  const canSearchProducts = can('menu.view') || can('retail_inventory.view') || can('retail_purchasing.grn.receive');
  if (group === 'catalog_products' && canSearchProducts) {
    groups.push(await searchCatalogProducts(db, { query, page, limit, active, categoryId, stockStatus, sort, prefix }));
    return { query, groups };
  }
  if (group === 'product_families' && canSearchProducts) {
    const pattern = like(query);
    const rows = await db.all(`SELECT p.id,p.name AS title,p.brand,COUNT(v.id) AS variant_count
      FROM menu_items p JOIN menu_item_variants v ON v.menu_item_id=p.id
      WHERE (lower(p.name) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.brand,'')) LIKE ? ESCAPE '\\'
        OR lower(COALESCE(p.barcode,'')) LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM menu_item_variants matched WHERE matched.menu_item_id=p.id AND
          (lower(COALESCE(matched.variant_name,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(matched.sku,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(matched.barcode,'')) LIKE ? ESCAPE '\\'))
        OR EXISTS (SELECT 1 FROM product_barcodes pb LEFT JOIN menu_item_variants coded ON coded.id=pb.variant_id
          WHERE (pb.menu_item_id=p.id OR coded.menu_item_id=p.id) AND lower(pb.barcode) LIKE ? ESCAPE '\\'))
      GROUP BY p.id,p.name,p.brand ORDER BY p.name LIMIT ? OFFSET ?`,
    [pattern, pattern, pattern, pattern, pattern, pattern, pattern, limit + 1, (page - 1) * limit]);
    groups.push({ key: group, page, has_more: rows.length > limit, results: rows.slice(0, limit) });
    return { query, groups };
  }
  if (group === 'product_variants' && canSearchProducts && Number(productId) > 0) {
    const rows = await db.all('SELECT v.id,v.variant_name,v.sku,v.tracking_mode,p.id AS product_id,p.name AS title FROM menu_item_variants v JOIN menu_items p ON p.id=v.menu_item_id WHERE p.id=? AND v.merchandising_active=1 ORDER BY v.is_default DESC,v.variant_name,v.id LIMIT 201', [Number(productId)]);
    if (Number(locationId) > 0) {
      const balances = await db.all('SELECT b.variant_id,SUM(b.quantity_on_hand) AS on_hand FROM inventory_balances b JOIN menu_item_variants v ON v.id=b.variant_id WHERE v.menu_item_id=? AND b.location_id=? GROUP BY b.variant_id', [Number(productId), Number(locationId)]);
      const byVariant = new Map(balances.map((row) => [Number(row.variant_id), Number(row.on_hand)]));
      for (const row of rows) row.on_hand = byVariant.get(Number(row.id)) || 0;
    }
    groups.push({ key: group, page: 1, has_more: false, results: rows });
    return { query, groups };
  }
  if (prefix === '/admin' && can('warranty.view')) await ensureAfterSalesSchema(db);
  const add = async (key, permission, { from, columns, identifier, textColumns, href, where = '1=1', params = [] }) => {
    if ((group && group !== key) || !(Array.isArray(permission) ? permission.some(can) : can(permission)) || (!query && !group)) return;
    const fuzzy = textColumns.map((column) => `lower(COALESCE(${column}, '')) LIKE ? ESCAPE '\\'`).join(' OR ');
    const filter = query ? `(${identifier} = ? OR ${fuzzy})` : '1=1';
    const values = query ? [query, ...textColumns.map(() => like(query))] : [];
    const idColumn = columns.split(',')[0].trim();
    const rows = await db.all(`SELECT ${columns}, CASE WHEN ${identifier} = ? THEN 1 ELSE 0 END AS exact_match
      FROM ${from} WHERE ${where} AND ${filter}
      ORDER BY exact_match DESC, ${idColumn} DESC LIMIT ? OFFSET ?`, [query, ...params, ...values, limit + 1, (page - 1) * limit]);
    groups.push({ key, page, has_more: rows.length > limit, results: rows.slice(0, limit).map((row) => ({ ...row, href: href(row) })) });
  };
  if ((!group || group === 'products') && (can('menu.view') || can('retail_inventory.view') || can('retail_purchasing.grn.receive')) && (query || group)) {
    const match = query ? await findByBarcode(db, query) : null;
    const location = await getDefaultLocation(db);
    const conditions = active ? ['p.is_available = 1','v.merchandising_active = 1'] : ['1=1'];
    const params = [];
    let stockJoin = '';
    const joinParams = [];
    if (Number.isInteger(Number(categoryId)) && Number(categoryId) > 0) { conditions.push('p.category_id = ?'); params.push(Number(categoryId)); }
    if (brand) { conditions.push(`lower(COALESCE(p.brand,'')) LIKE ? ESCAPE '\\'`); params.push(like(String(brand).trim().slice(0, 80))); }
    if (['none', 'batch', 'serial'].includes(tracking)) { conditions.push('v.tracking_mode = ?'); params.push(tracking); }
    if (['in_stock', 'out_of_stock', 'low_stock'].includes(stockStatus)) {
      stockJoin = `LEFT JOIN (SELECT b.variant_id, SUM(b.quantity_on_hand) AS available_stock FROM inventory_balances b
        JOIN inventory_locations loc ON loc.id=b.location_id
        LEFT JOIN inventory_batches ib ON ib.id=b.batch_id
        WHERE b.location_id=? AND loc.is_sellable=1
          AND (b.batch_id IS NULL OR (ib.status='active' AND (ib.expiry_date IS NULL OR ib.expiry_date>=?)))
        GROUP BY b.variant_id) stock_filter ON stock_filter.variant_id=v.id`;
      joinParams.push(location.id, new Date().toISOString().slice(0, 10));
      const available = 'COALESCE(stock_filter.available_stock,0)';
      conditions.push(stockStatus === 'out_of_stock' ? `${available}=0` : stockStatus === 'low_stock'
        ? `${available}>0 AND ${available}<=COALESCE(v.reorder_point,0) AND COALESCE(v.reorder_point,0)>0`
        : `${available}>0`);
    }
    if (match) {
      conditions.push(match.variantId ? 'v.id = ?' : 'p.id = ?');
      params.push(match.variantId || match.menuItemId);
    } else if (query) {
      conditions.push(`(v.id = ? OR p.id = ? OR v.sku = ? OR lower(p.name) LIKE ? ESCAPE '\\' OR lower(COALESCE(v.variant_name,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.brand,'')) LIKE ? ESCAPE '\\')`);
      params.push(match?.variantId || -1, match?.menuItemId || -1, query, like(query), like(query), like(query));
    }
    const rows = await db.all(`SELECT v.id, p.id AS product_id, p.name AS title, v.variant_name, v.sku,
      COALESCE(v.barcode,p.barcode) AS barcode, v.price, v.mrp, v.tracking_mode, p.brand, p.is_available, p.image_url,
      c.name AS category_name, CASE WHEN v.id = ? OR p.id = ? OR v.sku = ? THEN 1 ELSE 0 END AS exact_match
      FROM menu_item_variants v JOIN menu_items p ON p.id=v.menu_item_id LEFT JOIN menu_categories c ON c.id=p.category_id ${stockJoin}
      WHERE ${conditions.join(' AND ')} ORDER BY exact_match DESC, ${sort === 'price' ? 'v.price, p.name' : 'p.name'}, v.id LIMIT ? OFFSET ?`,
    [match?.variantId || -1, match?.menuItemId || -1, query, ...joinParams, ...params, limit + 1, (page - 1) * limit]);
    const visible = rows.slice(0, limit);
    const stock = await getSellableStockBulk(db, visible.map((row) => row.id), { locationId: location?.id });
    groups.push({ key: 'products', page, has_more: rows.length > limit, results: visible.map((row) => ({ ...row, available_stock: stock[row.id] || 0, href: `${prefix}/products?product=${row.product_id}` })) });
  }
  await add('serials', ['retail_pos.use','retail_inventory.view'], { from: 'inventory_serials s JOIN menu_item_variants v ON v.id=s.variant_id', columns: 's.id, s.serial_number AS title, s.status, s.variant_id, v.menu_item_id AS product_id', identifier: 's.serial_number', textColumns: ['s.serial_number'], href: (r) => prefix === '/admin' ? `/admin/retail-inventory-tracking?serial=${encodeURIComponent(r.title)}` : `${prefix}/products?product=${r.product_id}&serial=${encodeURIComponent(r.title)}` });
  await add('batches', 'retail_inventory.view', { from: 'inventory_batches b JOIN menu_item_variants v ON v.id=b.variant_id', columns: 'b.id, b.batch_number AS title, b.status, b.expiry_date, v.menu_item_id AS product_id', identifier: 'b.batch_number', textColumns: ['b.batch_number'], href: (r) => prefix === '/admin' ? `/admin/retail-inventory-tracking?batch=${encodeURIComponent(r.title)}` : `${prefix}/products?product=${r.product_id}` });
  await add('customers', 'customers.access', { from: 'customers c', columns: 'c.id, c.name AS title, c.phone', identifier: 'c.phone_digits', textColumns: ['c.name', 'c.phone'], href: (r) => prefix === '/admin' ? `/admin/retail-customers/${r.id}` : `${prefix}/customers/${r.id}` });
  await add('sales', 'retail_sale.view', { from: 'retail_sales s', columns: 's.id, s.sale_number AS title, s.status, s.grand_total', identifier: 's.sale_number', textColumns: ['s.sale_number'], where: "s.status <> 'HELD'", href: (r) => `${prefix}/retail-sales-history/${r.id}` });
  if (prefix === '/admin') await add('online_orders', 'retail_online_orders.view', { from: 'retail_online_orders o', columns: 'o.id,o.order_number AS title,o.customer_name,o.status,o.total', identifier:'o.order_number',textColumns:['o.order_number','o.customer_name','o.customer_phone','o.payment_reference'],href:r=>`/admin/retail-online-orders/${r.id}` });
  await add('returns', 'retail_return.create', { from: 'retail_returns r', columns: 'r.id, r.return_number AS title, r.status, r.original_sale_id', identifier: 'r.return_number', textColumns: ['r.return_number'], href: (r) => `${prefix}/retail-sales-history/${r.original_sale_id}` });
  await add('payments', 'retail_sale.view', { from: 'retail_sale_payments p', columns: 'p.id, p.reference AS title, p.method, p.retail_sale_id', identifier: 'p.reference', textColumns: ['p.reference'], href: (r) => `${prefix}/retail-sales-history/${r.retail_sale_id}` });
  if (prefix === '/admin') {
    await add('warranty_claims', 'warranty.view', { from: 'warranty_claims w LEFT JOIN customers c ON c.id=w.customer_id JOIN menu_item_variants v ON v.id=w.variant_id JOIN menu_items p ON p.id=v.menu_item_id', columns: 'w.id,w.claim_number AS title,w.status,w.serial_number', identifier: 'w.claim_number', textColumns: ['w.claim_number','w.serial_number','c.phone','c.name','p.name'], href: r=>`/admin/retail-after-sales?claim=${r.id}` });
    await add('supplier_rmas', 'warranty.rma', { from: 'warranty_rmas r', columns: 'r.id,r.rma_number AS title,r.status,r.claim_id', identifier: 'r.rma_number', textColumns: ['r.rma_number','r.supplier_reference'], href: r=>`/admin/retail-after-sales?claim=${r.claim_id}` });
    await add('repair_jobs', 'warranty.view', { from: 'warranty_repairs r JOIN warranty_claims c ON c.id=r.claim_id', columns: 'r.id,c.claim_number AS title,r.status,r.claim_id', identifier: 'c.claim_number', textColumns: ['c.claim_number','c.serial_number','r.diagnosis'], href: r=>`/admin/retail-after-sales?claim=${r.claim_id}` });
  }
  if (prefix === '/admin') await add('collections', 'customer_ledger.access', { from: 'retail_credit_collections cc JOIN customers c ON c.id=cc.customer_id', columns: 'cc.id, cc.collection_number AS title, c.name AS customer_name, cc.amount', identifier: 'cc.collection_number', textColumns: ['cc.collection_number', 'c.name', 'cc.payment_reference'], href: (r) => `/admin/retail-receivables?collection=${r.id}` });
  if (prefix === '/admin') await add('expenses', 'expenses.manage', { from: 'expenses e', columns: 'e.id, e.description AS title, e.category, e.amount', identifier: 'CAST(e.id AS TEXT)', textColumns: ['e.description', 'e.category'], href: (r) => `/admin/expenses?expense=${r.id}` });
  if (prefix === '/admin') await add('journals', 'general_ledger.view', { from: 'journal_entries j', columns: 'j.id, j.memo AS title, j.source_type, j.source_id', identifier: 'CAST(j.id AS TEXT)', textColumns: ['j.memo', 'j.source_type'], href: (r) => `/admin/retail-journals/${r.id}` });
  if (prefix === '/admin') await add('goods_receipts', 'retail_purchasing.grn.receive', { from: 'goods_receipts g', columns: 'g.id, g.grn_number AS title, g.status, g.invoice_number', identifier: 'g.grn_number', textColumns: ['g.grn_number', 'g.invoice_number'], href: () => '/admin/retail-goods-receipts' });
  if (prefix === '/admin') await add('purchase_orders', 'retail_purchasing.po.create', { from: 'purchase_orders po', columns: 'po.id, po.po_number AS title, po.status, po.supplier_id', identifier: 'po.po_number', textColumns: ['po.po_number'], href: (r) => `/admin/retail-purchase-orders?po=${r.id}` });
  if (prefix === '/admin') await add('purchase_returns', 'retail_purchasing.return.create', { from: 'purchase_returns pr', columns: 'pr.id, pr.return_number AS title, pr.status, pr.supplier_id', identifier: 'pr.return_number', textColumns: ['pr.return_number'], href: () => '/admin/retail-purchase-returns' });
  if (prefix === '/admin') await add('transfers', 'retail_inventory.view', { from: 'retail_transfers t', columns: 't.id, t.transfer_number AS title, t.status', identifier: 't.transfer_number', textColumns: ['t.transfer_number'], href: (r) => `/admin/retail-transfers/${r.id}` });
  if (prefix === '/admin') await add('stock_counts', 'retail_inventory.view', { from: 'retail_stock_counts c', columns: 'c.id, c.count_number AS title, c.status', identifier: 'c.count_number', textColumns: ['c.count_number'], href: (r) => `/admin/retail-stock-counts/${r.id}` });
  await add('suppliers', 'suppliers.view', { from: 'suppliers s', columns: 's.id, s.name AS title, s.phone', identifier: 's.name', textColumns: ['s.name', 's.phone'], href: (r) => prefix === '/admin' ? `/admin/retail-suppliers?supplier=${r.id}` : `${prefix}/suppliers/${r.id}` });
  await add('categories', 'menu.view', { from: 'menu_categories c', columns: 'c.id, c.name AS title', identifier: 'c.name', textColumns: ['c.name'], href: () => `${prefix}/products` });
  return { query, groups };
}
