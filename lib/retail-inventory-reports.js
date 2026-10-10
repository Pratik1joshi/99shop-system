/**
 * Read-only retail inventory intelligence — reorder, low/out-of-stock,
 * near-expiry/expired (thin wrappers over lib/retail-inventory.js's own
 * queries), fast/slow/dead stock, ageing, valuation and the filterable
 * movement ledger. Nothing here writes anything; every number is derived
 * from inventory_balances/inventory_movements/inventory_costs, the same
 * single source of truth every other retail file uses.
 *
 * ── SELLABLE, NOT RAW, ON-HAND ─────────────────────────────────────────────
 * Every "is this low/out of stock" judgment uses getSellableStockBulk() —
 * raw on-hand would hide a real shortage behind quarantined or expired
 * units that can never be sold (spec's own required test: 20 on hand, 8
 * expired, 5 in quarantine, 7 sellable, reorder point 10 -> NEEDS REORDER,
 * which raw on-hand alone would miss).
 *
 * ── INVENTORY AGEING: AN HONEST LIMITATION ────────────────────────────────
 * Batch-tracked stock has a real receipt layer (inventory_batches.received_at)
 * to age from. Non-batch stock is a single pooled moving-average quantity —
 * this system does not keep FIFO receipt layers for it, so "this specific
 * remaining unit is 47 days old" is not a knowable fact, only a guess. Rather
 * than fabricate one, getInventoryAgeing() only ages batch-tracked stock and
 * explicitly reports which variants were excluded and why.
 */

import { getSellableStockBulk, getMovingAverageCost, getInventoryValuation } from '@/lib/retail-inventory.js';
import { accountBalance } from '@/lib/accounting.js';
import { ensureRetailPurchasingSchema } from '@/lib/retail-purchasing.js';
import { ensureRetailReservationSchema } from '@/lib/retail-reservations.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Every variant with a reorder_point set, its current sellable stock, and
 * whether it needs reordering — plus the last supplier/cost this variant was
 * actually received from (derived from purchase history; no stored
 * "preferred supplier" field exists on the catalog to reuse).
 */
export async function getReorderSuggestions(db, { locationId = null } = {}) {
  await ensureRetailPurchasingSchema(db);
  await ensureRetailReservationSchema(db);
  const variants = await db.all(
    `SELECT v.id AS variant_id, v.variant_name, v.sku, v.reorder_point, v.reorder_quantity,
            mi.name AS product_name, mi.brand
       FROM product_variants v
       JOIN products mi ON mi.id = v.product_id
      WHERE v.reorder_point > 0`
  );
  if (!variants.length) return [];
  const ids = variants.map((v) => v.variant_id);
  const sellableMap = await getSellableStockBulk(db, ids, { locationId });
  const [latestReceipts, incomingRows, reservedRows] = await Promise.all([
    db.all(`SELECT variant_id,supplier_id,supplier_name,unit_cost,received_at FROM (
      SELECT grl.variant_id,grn.supplier_id,s.name AS supplier_name,grl.unit_cost,grn.posted_at AS received_at,
        ROW_NUMBER() OVER (PARTITION BY grl.variant_id ORDER BY grn.posted_at DESC,grl.id DESC) AS rank
      FROM goods_receipt_lines grl JOIN goods_receipts grn ON grn.id=grl.goods_receipt_id AND grn.status='POSTED'
      LEFT JOIN suppliers s ON s.id=grn.supplier_id) history WHERE rank=1`),
    db.all(`SELECT pol.variant_id,SUM((pol.ordered_quantity-pol.quantity_received)*pol.conversion_factor) AS quantity
      FROM purchase_order_lines pol JOIN purchase_orders po ON po.id=pol.purchase_order_id
      WHERE po.status IN ('APPROVED','PARTIALLY_RECEIVED') AND pol.ordered_quantity>pol.quantity_received
      ${locationId ? 'AND po.location_id=?' : ''} GROUP BY pol.variant_id`, locationId ? [locationId] : []),
    db.all(`SELECT variant_id,SUM(quantity) AS quantity FROM inventory_reservations WHERE status='ACTIVE'
      ${locationId ? 'AND location_id=?' : ''} GROUP BY variant_id`, locationId ? [locationId] : []),
  ]);
  const latest = new Map(latestReceipts.map((row) => [Number(row.variant_id), row]));
  const incoming = new Map(incomingRows.map((row) => [Number(row.variant_id), Number(row.quantity)]));
  const reserved = new Map(reservedRows.map((row) => [Number(row.variant_id), Number(row.quantity)]));

  const out = [];
  for (const v of variants) {
    const sellable = Number(sellableMap[v.variant_id] || 0);
    const reservedQuantity = reserved.get(Number(v.variant_id)) || 0;
    const available = Math.max(0, sellable - reservedQuantity);
    const incomingQuantity = incoming.get(Number(v.variant_id)) || 0;
    if (available + incomingQuantity > Number(v.reorder_point)) continue;
    const lastPurchase = latest.get(Number(v.variant_id));
    const suggested = Math.max(Number(v.reorder_quantity) || 0, Number(v.reorder_point) - available - incomingQuantity);
    out.push({
      variantId: v.variant_id, productName: v.product_name, variantName: v.variant_name, sku: v.sku, brand: v.brand,
      sellableStock: sellable, reservedQuantity, available, incomingQuantity,
      reorderPoint: Number(v.reorder_point), reorderQuantity: Number(v.reorder_quantity) || 0, suggestedQuantity: Math.max(1, suggested),
      lastSupplierName: lastPurchase?.supplier_name || null, lastSupplierId: lastPurchase?.supplier_id || null,
      lastPurchaseCost: lastPurchase?.unit_cost != null ? Number(lastPurchase.unit_cost) : null,
      lastPurchaseAt: lastPurchase?.received_at || null,
      status: available <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
      reason: `Available stock (${available}) plus approved incoming quantity (${incomingQuantity}) is at or below the reorder point (${Number(v.reorder_point)}).`,
    });
  }
  return out.sort((a, b) => a.available - b.available);
}

export async function getLowStock(db, opts = {}) {
  const rows = await getReorderSuggestions(db, opts);
  return rows.filter((r) => r.status === 'LOW_STOCK');
}

export async function getOutOfStock(db, opts = {}) {
  const rows = await getReorderSuggestions(db, opts);
  return rows.filter((r) => r.status === 'OUT_OF_STOCK');
}

/**
 * Units sold and last-sale date over a trailing window, for every variant
 * with any sellable stock right now. The caller decides what "slow" means —
 * this just exposes the raw numbers plus the two boolean classifications the
 * spec asks for, computed with an explicit, visible rule rather than a
 * hidden heuristic.
 */
export async function getMovementAnalysis(db, { days = 30, locationId = null, slowIfUnitsBelow = 1 } = {}) {
  const cutoff = new Date(Date.now() - Number(days) * 86400000).toISOString();
  const stockRows = await db.all(
    `SELECT b.variant_id, SUM(b.quantity_on_hand) AS on_hand, v.variant_name, mi.name AS product_name
       FROM inventory_balances b
       JOIN inventory_locations loc ON loc.id = b.location_id
       JOIN product_variants v ON v.id = b.variant_id
       JOIN products mi ON mi.id = v.product_id
      WHERE loc.is_sellable = 1 ${locationId ? 'AND b.location_id = ?' : ''}
      GROUP BY b.variant_id HAVING SUM(b.quantity_on_hand) > 0`,
    locationId ? [locationId] : []
  );
  const out = [];
  for (const row of stockRows) {
    const sales = await db.get(
      `SELECT COALESCE(SUM(sl.quantity), 0) AS units, COUNT(DISTINCT sl.retail_sale_id) AS sale_count, MAX(s.completed_at) AS last_sale_at
         FROM retail_sale_lines sl JOIN retail_sales s ON s.id = sl.retail_sale_id
        WHERE sl.variant_id = ? AND s.status = 'COMPLETED' AND s.completed_at >= ?`,
      [row.variant_id, cutoff]
    );
    const lastSaleOverall = await db.get(
      `SELECT MAX(s.completed_at) AS last_sale_at FROM retail_sale_lines sl JOIN retail_sales s ON s.id = sl.retail_sale_id
        WHERE sl.variant_id = ? AND s.status = 'COMPLETED'`,
      [row.variant_id]
    );
    out.push({
      variantId: row.variant_id,
      productName: row.product_name,
      variantName: row.variant_name,
      sellableStock: Number(row.on_hand),
      unitsSoldInPeriod: Number(sales?.units || 0),
      saleCountInPeriod: Number(sales?.sale_count || 0),
      lastSaleAt: lastSaleOverall?.last_sale_at || null,
      periodDays: Number(days),
      isSlowMoving: Number(sales?.units || 0) < Number(slowIfUnitsBelow),
    });
  }
  return out;
}

/**
 * Dead stock = still has sellable quantity, has NOT sold within `days`, AND
 * was first received more than `days` ago (a genuinely new product that
 * simply hasn't sold yet is not "dead" — spec explicit).
 */
export async function getDeadStock(db, { days = 90, locationId = null } = {}) {
  const analysis = await getMovementAnalysis(db, { days, locationId, slowIfUnitsBelow: 1 });
  const cutoff = new Date(Date.now() - Number(days) * 86400000).toISOString();
  const out = [];
  for (const row of analysis) {
    if (row.lastSaleAt && row.lastSaleAt >= cutoff) continue; // sold recently enough
    const firstReceived = await db.get(
      `SELECT MIN(created_at) AS first_at FROM inventory_movements
        WHERE variant_id = ? AND movement_type IN ('PURCHASE_RECEIPT', 'OPENING_STOCK')`,
      [row.variantId]
    );
    if (!firstReceived?.first_at || firstReceived.first_at >= cutoff) continue; // too new to call dead
    const { averageCost } = await getMovingAverageCost(db, row.variantId);
    out.push({ ...row, firstReceivedAt: firstReceived.first_at, inventoryValue: round2(row.sellableStock * averageCost) });
  }
  return out;
}

const AGEING_BUCKETS = [
  { label: '0-30', max: 30 }, { label: '31-60', max: 60 }, { label: '61-90', max: 90 },
  { label: '91-180', max: 180 }, { label: '181-365', max: 365 }, { label: '365+', max: Infinity },
];

/** Batch-tracked stock only — see file header for why non-batch is excluded. */
export async function getInventoryAgeing(db, { locationId = null } = {}) {
  const rows = await db.all(
    `SELECT b.variant_id, b.quantity_on_hand, b.allocated_value, ib.received_at, ib.unit_cost, v.variant_name, v.tracking_mode
       FROM inventory_balance_valuation b
       JOIN inventory_batches ib ON ib.id = b.batch_id
       JOIN product_variants v ON v.id = b.variant_id
      WHERE b.quantity_on_hand > 0 ${locationId ? 'AND b.location_id = ?' : ''}`,
    locationId ? [locationId] : []
  );
  const now = Date.now();
  const buckets = AGEING_BUCKETS.map((b) => ({ ...b, quantity: 0, value: 0 }));
  let totalValue = 0;
  for (const row of rows) {
    const ageDays = row.received_at ? Math.floor((now - new Date(row.received_at).getTime()) / 86400000) : null;
    const bucket = buckets.find((b) => ageDays != null && ageDays <= b.max) || buckets[buckets.length - 1];
    const value = Number(row.allocated_value);
    bucket.quantity = round2(bucket.quantity + Number(row.quantity_on_hand));
    bucket.value = round2(bucket.value + value);
    totalValue = round2(totalValue + value);
  }
  const nonBatchVariants = await db.all(
    `SELECT DISTINCT v.id AS variant_id, v.variant_name FROM inventory_balances b
       JOIN product_variants v ON v.id = b.variant_id
      WHERE b.batch_id IS NULL AND b.quantity_on_hand > 0 ${locationId ? 'AND b.location_id = ?' : ''}`,
    locationId ? [locationId] : []
  );
  return {
    buckets: buckets.map(({ label, quantity, value }) => ({
      label, quantity, value, percentOfValue: totalValue > 0 ? round2((value / totalValue) * 100) : 0,
    })),
    totalValue,
    excludedNonBatchVariants: nonBatchVariants,
    limitation: 'Ageing covers batch-tracked stock only — non-batch (pooled moving-average) inventory has no per-unit receipt layer to age from.',
  };
}

/** Per-location/batch valuation detail — the drill-down behind getInventoryValuation()'s totals. */
export async function getInventoryValuationDetail(db, { locationId = null } = {}) {
  return db.all(
    `SELECT b.variant_id, v.variant_name, v.sku, mi.name AS product_name, l.id AS location_id, l.name AS location_name, l.is_sellable,
            b.batch_id, ib.batch_number, b.quantity_on_hand, c.average_cost,
            b.allocated_value AS value
       FROM inventory_balance_valuation b
       JOIN product_variants v ON v.id = b.variant_id
       JOIN products mi ON mi.id = v.product_id
       JOIN inventory_locations l ON l.id = b.location_id
       LEFT JOIN inventory_batches ib ON ib.id = b.batch_id
       LEFT JOIN inventory_costs c ON c.variant_id = b.variant_id
      WHERE b.quantity_on_hand > 0 ${locationId ? 'AND b.location_id = ?' : ''}
      ORDER BY l.name, v.variant_name`,
    locationId ? [locationId] : []
  );
}

/** Ledger valuation vs the 1210 Retail Inventory GL balance — must match. */
export async function reconcileInventoryValuation(db) {
  const { total } = await getInventoryValuation(db);
  const glBalance = round2(await accountBalance(db, '1210'));
  const difference = round2(total - glBalance);
  return { ledgerTotal: total, glBalance, difference, reconciled: Math.abs(difference) < 0.01 };
}

/** Filterable movement ledger — the operational view over inventory_movements. */
export async function getMovementLedger(db, filters = {}) {
  const { variantId, locationId, batchId, movementType, referenceType, dateFrom, dateTo, createdBy, limit = 200 } = filters;
  const clauses = ['1=1'];
  const params = [];
  if (variantId) { clauses.push('m.variant_id = ?'); params.push(variantId); }
  if (locationId) { clauses.push('m.location_id = ?'); params.push(locationId); }
  if (batchId) { clauses.push('m.batch_id = ?'); params.push(batchId); }
  if (movementType) { clauses.push('m.movement_type = ?'); params.push(movementType); }
  if (referenceType) { clauses.push('m.reference_type = ?'); params.push(referenceType); }
  if (createdBy) { clauses.push('m.created_by = ?'); params.push(createdBy); }
  if (dateFrom) { clauses.push('m.created_at >= ?'); params.push(dateFrom); }
  if (dateTo) { clauses.push('m.created_at <= ?'); params.push(dateTo); }
  params.push(Math.min(1000, Math.max(1, Number(limit) || 200)));

  return db.all(
    `SELECT m.*, v.variant_name, v.sku, mi.name AS product_name, l.name AS location_name, ib.batch_number, u.full_name AS created_by_name
       FROM inventory_movements m
       LEFT JOIN product_variants v ON v.id = m.variant_id
       LEFT JOIN products mi ON mi.id = v.product_id
       LEFT JOIN inventory_locations l ON l.id = m.location_id
       LEFT JOIN inventory_batches ib ON ib.id = m.batch_id
       LEFT JOIN users u ON u.id = m.created_by
      WHERE ${clauses.join(' AND ')}
      ORDER BY m.id DESC LIMIT ?`,
    params
  );
}
