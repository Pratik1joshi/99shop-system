/**
 * Retail physical stock counts (stocktake) — a real auditable workflow, not
 * "type a new number, overwrite the balance". Routes every quantity change
 * through lib/retail-inventory.js's receiveStock/issueStock, same as every
 * other retail domain.
 *
 * ── SNAPSHOT + LIVE-MOVEMENT RECONCILIATION (spec's own required test) ────
 * A count freezes `expected_quantity` per line at the moment counting starts
 * (the system balance right then). The shop keeps selling/receiving during
 * the count, so naively comparing the physical tally to that frozen number
 * would misreport every sale that happened in between as "shrinkage". So
 * variance is never `physical - expected_quantity` — it is always:
 *
 *   reconciledExpected = expected_quantity + SUM(inventory_movements.quantity
 *                          for this variant/location/batch WHERE created_at > snapshot_at)
 *   variance = physical_quantity - reconciledExpected
 *
 * This is recomputed fresh every time it's read (review screen) AND once
 * more, atomically, at the instant of posting — so a sale that happens
 * between "review" and "approve & post" is still correctly folded in rather
 * than silently misattributed to shrinkage. Example: snapshot=10, a sale of
 * -2 happens mid-count, physical tally finds 8 -> reconciledExpected = 8 ->
 * variance = 0 (not the naive -2).
 *
 * ── POSTING ─────────────────────────────────────────────────────────────
 * Zero-variance lines post nothing (spec explicit). A positive variance is
 * valued at the variant's CURRENT moving-average cost (there is no other
 * defensible basis for "found" stock — see file header of
 * lib/retail-inventory-adjustments.js for the same policy applied to manual
 * adjustments) and posts STOCK_ADJUSTMENT_IN / Dr 1210 Cr 5042 (Inventory
 * Gain). A negative variance posts STOCK_ADJUSTMENT_OUT, costed by
 * postMovement at the average as usual, Dr 5040 (Wastage/Inventory Loss) Cr
 * 1210. One compound journal per count covers every line.
 */

import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import { ensureRetailInventorySchema, receiveStock, issueStock, getMovingAverageCost } from '@/lib/retail-inventory.js';
import { postJournal } from '@/lib/accounting.js';
import { ensureDocumentNumberSchema, nextDocumentNumber } from '@/lib/document-numbers.js';
import { currentBusinessDayId } from '@/lib/business-days.js';
import { ensureRetailSerialsSchema, applySerialStockChange } from '@/lib/retail-serials.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

export const COUNT_TYPES = ['FULL', 'CYCLE', 'LOCATION', 'CATEGORY'];

export async function ensureRetailStockCountsSchema(db) {
  await ensureRetailInventorySchema(db);
  await ensureRetailSerialsSchema(db);
  await ensureDocumentNumberSchema(db);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_stock_counts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    count_number TEXT UNIQUE,
    location_id INTEGER NOT NULL,
    count_type TEXT NOT NULL DEFAULT 'CYCLE',
    status TEXT NOT NULL DEFAULT 'COUNTING',
    blind INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    counted_by INTEGER,
    approved_by INTEGER,
    snapshot_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    snapshot_movement_id INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    posted_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_stock_count_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retail_stock_count_id INTEGER NOT NULL,
    variant_id INTEGER NOT NULL,
    batch_id INTEGER,
    expected_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
    snapshot_movement_id INTEGER NOT NULL DEFAULT 0,
    physical_quantity NUMERIC(14,3),
    reconciled_expected_quantity NUMERIC(14,3),
    variance NUMERIC(14,3),
    value_variance NUMERIC(14,2)
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_stock_count_line_serials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retail_stock_count_line_id INTEGER NOT NULL,
    serial_number TEXT NOT NULL,
    expected INTEGER NOT NULL DEFAULT 0,
    counted INTEGER NOT NULL DEFAULT 0,
    UNIQUE (retail_stock_count_line_id, serial_number)
  )`);
}

async function loadCount(db, id) {
  const count = await db.get(
    `SELECT c.*, l.name AS location_name FROM retail_stock_counts c LEFT JOIN inventory_locations l ON l.id = c.location_id WHERE c.id = ?`,
    [id]
  );
  if (!count) throw bad('Stock count not found.', 404);
  const lines = await db.all(
    `SELECT cl.*, v.variant_name, v.tracking_mode, mi.name AS product_name, ib.batch_number
       FROM retail_stock_count_lines cl
       LEFT JOIN menu_item_variants v ON v.id = cl.variant_id
       LEFT JOIN menu_items mi ON mi.id = v.menu_item_id
       LEFT JOIN inventory_batches ib ON ib.id = cl.batch_id
      WHERE cl.retail_stock_count_id = ? ORDER BY cl.id`,
    [id]
  );
  const identities = await db.all(`SELECT cs.retail_stock_count_line_id,cs.serial_number,cs.expected,cs.counted
    FROM retail_stock_count_line_serials cs JOIN retail_stock_count_lines cl ON cl.id=cs.retail_stock_count_line_id
    WHERE cl.retail_stock_count_id=? ORDER BY cs.serial_number`, [id]);
  const byLine = new Map();
  for (const serial of identities) {
    if (!byLine.has(Number(serial.retail_stock_count_line_id))) byLine.set(Number(serial.retail_stock_count_line_id), []);
    byLine.get(Number(serial.retail_stock_count_line_id)).push(serial);
  }
  for (const line of lines) if (line.tracking_mode === 'serial') line.serials = byLine.get(Number(line.id)) || [];
  return { ...count, lines };
}

export async function getStockCount(db, id) {
  await ensureRetailStockCountsSchema(db);
  return loadCount(db, id);
}

export async function listStockCounts(db, { status = null, limit = 200 } = {}) {
  await ensureRetailStockCountsSchema(db);
  const where = status ? `WHERE c.status = ?` : '';
  const params = status ? [status, Math.min(500, Math.max(1, Number(limit) || 200))] : [Math.min(500, Math.max(1, Number(limit) || 200))];
  return db.all(
    `SELECT c.*, l.name AS location_name,
            (SELECT COUNT(*) FROM retail_stock_count_lines WHERE retail_stock_count_id = c.id) AS line_count
       FROM retail_stock_counts c
       LEFT JOIN inventory_locations l ON l.id = c.location_id
       ${where}
      ORDER BY c.id DESC LIMIT ?`,
    params
  );
}

/** Resolves which (variant, batch) pairs a count covers at snapshot time. */
async function resolveScopeBalances(db, { locationId, countType, categoryId, variantIds }) {
  if (countType === 'CYCLE') {
    if (!variantIds?.length) throw bad('CYCLE count requires an explicit list of variants.');
    const placeholders = variantIds.map(() => '?').join(',');
    return db.all(
      `SELECT b.variant_id, b.batch_id, b.quantity_on_hand
         FROM inventory_balances b WHERE b.location_id = ? AND b.variant_id IN (${placeholders})`,
      [locationId, ...variantIds]
    );
  }
  if (countType === 'CATEGORY') {
    if (!categoryId) throw bad('CATEGORY count requires a categoryId.');
    return db.all(
      `SELECT b.variant_id, b.batch_id, b.quantity_on_hand
         FROM inventory_balances b
         JOIN menu_item_variants v ON v.id = b.variant_id
         JOIN menu_items mi ON mi.id = v.menu_item_id
        WHERE b.location_id = ? AND mi.category_id = ?`,
      [locationId, categoryId]
    );
  }
  // FULL / LOCATION — every balance row at the location.
  return db.all(`SELECT b.variant_id, b.batch_id, b.quantity_on_hand FROM inventory_balances b WHERE b.location_id = ?`, [locationId]);
}

/**
 * CREATE + CAPTURE SNAPSHOT in one step — counting starts immediately, which
 * is when the spec says the snapshot must be taken. Every scoped (variant,
 * batch) pair gets a line with expected_quantity frozen from the current
 * balance; physical_quantity starts null until counted.
 */
export async function createStockCount(db, data) {
  const { locationId, countType = 'CYCLE', blind = false, createdBy = null, notes = null, categoryId = null, variantIds = null } = data;
  if (!locationId) throw bad('A location is required.');
  if (!COUNT_TYPES.includes(countType)) throw bad(`Unknown count type "${countType}".`);
  await ensureRetailStockCountsSchema(db);

  const scope = await resolveScopeBalances(db, { locationId, countType, categoryId, variantIds });
  if (!scope.length) throw bad('No stock found in scope for this count.');
  const serialVariants = new Set((await db.all(`SELECT id FROM menu_item_variants WHERE tracking_mode='serial'`)).map((row) => Number(row.id)));

  return db.transaction(async (tx) => {
    const countNumber = await nextDocumentNumber(tx, { type: 'retail_stock_count', prefix: 'SC' });
    // A monotonic movement-id watermark, not a wall-clock timestamp — SQLite's
    // CURRENT_TIMESTAMP has only second-level precision, so a sale posted in
    // the same second as the snapshot would otherwise be invisible to
    // "movements after the snapshot" and silently misreported as shrinkage.
    const watermark = await tx.get(`SELECT COALESCE(MAX(id), 0) AS max_id FROM inventory_movements`);
    const result = await tx.run(
      `INSERT INTO retail_stock_counts (count_number, location_id, count_type, status, blind, created_by, counted_by, notes, snapshot_movement_id)
       VALUES (?, ?, ?, 'COUNTING', ?, ?, ?, ?, ?)`,
      [countNumber, locationId, countType, blind ? 1 : 0, createdBy, createdBy, notes, Number(watermark?.max_id || 0)]
    );
    const countId = result.lastInsertRowid;
    const lineWatermark = Number(watermark?.max_id || 0);
    for (const row of scope) {
      const line = await tx.run(
        `INSERT INTO retail_stock_count_lines (retail_stock_count_id, variant_id, batch_id, expected_quantity, snapshot_movement_id) VALUES (?, ?, ?, ?, ?)`,
        [countId, row.variant_id, row.batch_id, row.quantity_on_hand, lineWatermark]
      );
      if (serialVariants.has(Number(row.variant_id))) {
        const serials = await tx.all(`SELECT serial_number FROM inventory_serials WHERE variant_id=? AND location_id=?
          AND status IN ('IN_STOCK','QUARANTINE') ORDER BY serial_number`, [row.variant_id, locationId]);
        if (serials.length !== Number(row.quantity_on_hand)) throw bad('Serial identity count differs from stock balance. Reconcile this SKU before counting.', 409);
        for (const serial of serials) await tx.run(`INSERT INTO retail_stock_count_line_serials
          (retail_stock_count_line_id,serial_number,expected,counted) VALUES (?,?,1,0)`, [line.lastInsertRowid, serial.serial_number]);
      }
    }
    return loadCount(tx, countId);
  });
}

/** Manual entry — sets the absolute physical tally for one line. */
export async function setCountQuantity(db, countId, lineId, { physicalQuantity, countedBy = null } = {}) {
  await ensureRetailStockCountsSchema(db);
  const count = await db.get(`SELECT * FROM retail_stock_counts WHERE id = ?`, [countId]);
  if (!count) throw bad('Stock count not found.', 404);
  if (count.status !== 'COUNTING') throw bad(`Cannot record counts on a count in status ${count.status}.`, 409);
  const qty = Number(physicalQuantity);
  if (!Number.isFinite(qty) || qty < 0) throw bad('Physical quantity must be zero or a positive number.');
  const line = await db.get(`SELECT * FROM retail_stock_count_lines WHERE id = ? AND retail_stock_count_id = ?`, [lineId, countId]);
  if (!line) throw bad('Count line not found.', 404);
  const variant = await db.get(`SELECT tracking_mode FROM menu_item_variants WHERE id=?`, [line.variant_id]);
  if (variant?.tracking_mode === 'serial') throw bad('Count exact serial identities for this item instead of entering a quantity.', 409);
  await db.run(`UPDATE retail_stock_count_lines SET physical_quantity = ? WHERE id = ?`, [qty, lineId]);
  if (countedBy) await db.run(`UPDATE retail_stock_counts SET counted_by = ? WHERE id = ?`, [countedBy, countId]);
  return db.get(`SELECT * FROM retail_stock_count_lines WHERE id = ?`, [lineId]);
}

/** Counter records the complete physical set, including an explicit empty set. */
export async function setCountSerials(db, countId, lineId, { serialNumbers, countedBy = null } = {}) {
  await ensureRetailStockCountsSchema(db);
  if (!Array.isArray(serialNumbers)) throw bad('Serial identities must be a list.');
  const serials = serialNumbers.map((value) => String(value).trim()).filter(Boolean);
  if (serials.length !== serialNumbers.length || new Set(serials).size !== serials.length) throw bad('Enter distinct non-empty serial identities.');
  return db.transaction(async (tx) => {
    const count = await tx.get(`SELECT * FROM retail_stock_counts WHERE id=?`, [countId]);
    if (!count) throw bad('Stock count not found.', 404);
    if (count.status !== 'COUNTING') throw bad('Serials can only be recorded while counting.', 409);
    const line = await tx.get(`SELECT cl.*,v.tracking_mode FROM retail_stock_count_lines cl
      JOIN menu_item_variants v ON v.id=cl.variant_id WHERE cl.id=? AND cl.retail_stock_count_id=?`, [lineId, countId]);
    if (!line || line.tracking_mode !== 'serial') throw bad('Choose a serial-tracked count line.', 400);
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    for (const serial of serials) {
      const existing = await tx.get(`SELECT variant_id,location_id,status FROM inventory_serials WHERE serial_number=?${lock}`, [serial]);
      if (existing && (Number(existing.variant_id) !== Number(line.variant_id) || Number(existing.location_id) !== Number(count.location_id) ||
        !['IN_STOCK','QUARANTINE'].includes(existing.status))) throw bad(`Serial "${serial}" belongs to another stock state. Resolve it before posting this count.`, 409);
    }
    await tx.run(`DELETE FROM retail_stock_count_line_serials WHERE retail_stock_count_line_id=? AND expected=0`, [lineId]);
    await tx.run(`UPDATE retail_stock_count_line_serials SET counted=0 WHERE retail_stock_count_line_id=?`, [lineId]);
    for (const serial of serials) await tx.run(`INSERT INTO retail_stock_count_line_serials
      (retail_stock_count_line_id,serial_number,expected,counted) VALUES (?,?,0,1)
      ON CONFLICT (retail_stock_count_line_id,serial_number) DO UPDATE SET counted=1`, [lineId, serial]);
    await tx.run(`UPDATE retail_stock_count_lines SET physical_quantity=? WHERE id=?`, [serials.length, lineId]);
    if (countedBy) await tx.run(`UPDATE retail_stock_counts SET counted_by=? WHERE id=?`, [countedBy, countId]);
    return loadCount(tx, countId);
  });
}

/**
 * Barcode-scan entry — increments the physical tally by `delta` (default 1).
 * If the scanned variant/batch isn't already in scope (unexpected find), a
 * new line is added on the fly with its own expected_quantity snapshot taken
 * right now, so it reconciles honestly just like every other line.
 */
export async function recordCountScan(db, countId, { variantId, batchId = null, delta = 1, countedBy = null } = {}) {
  await ensureRetailStockCountsSchema(db);
  const count = await db.get(`SELECT * FROM retail_stock_counts WHERE id = ?`, [countId]);
  if (!count) throw bad('Stock count not found.', 404);
  if (count.status !== 'COUNTING') throw bad(`Cannot record counts on a count in status ${count.status}.`, 409);
  const variant = await db.get(`SELECT tracking_mode FROM menu_item_variants WHERE id=?`, [variantId]);
  if (variant?.tracking_mode === 'serial') throw bad('Select the serial count line and scan its exact identities.', 409);

  let line = batchId == null
    ? await db.get(`SELECT * FROM retail_stock_count_lines WHERE retail_stock_count_id = ? AND variant_id = ? AND batch_id IS NULL`, [countId, variantId])
    : await db.get(`SELECT * FROM retail_stock_count_lines WHERE retail_stock_count_id = ? AND variant_id = ? AND batch_id = ?`, [countId, variantId, batchId]);

  if (!line) {
    const balanceQuery = batchId == null
      ? `SELECT quantity_on_hand FROM inventory_balances WHERE variant_id = ? AND location_id = ? AND batch_id IS NULL`
      : `SELECT quantity_on_hand FROM inventory_balances WHERE variant_id = ? AND location_id = ? AND batch_id = ?`;
    const balanceParams = batchId == null ? [variantId, count.location_id] : [variantId, count.location_id, batchId];
    const balance = await db.get(balanceQuery, balanceParams);
    // This line's OWN watermark, captured now — not the header's earlier
    // snapshot — since its expected_quantity is read at this later instant.
    const watermark = await db.get(`SELECT COALESCE(MAX(id), 0) AS max_id FROM inventory_movements`);
    const result = await db.run(
      `INSERT INTO retail_stock_count_lines (retail_stock_count_id, variant_id, batch_id, expected_quantity, physical_quantity, snapshot_movement_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [countId, variantId, batchId, balance?.quantity_on_hand || 0, 0, Number(watermark?.max_id || 0)]
    );
    line = { id: result.lastInsertRowid, physical_quantity: 0 };
  }
  const newQty = round3(Number(line.physical_quantity || 0) + Number(delta || 1));
  await db.run(`UPDATE retail_stock_count_lines SET physical_quantity = ? WHERE id = ?`, [newQty, line.id]);
  if (countedBy) await db.run(`UPDATE retail_stock_counts SET counted_by = ? WHERE id = ?`, [countedBy, countId]);
  return db.get(`SELECT * FROM retail_stock_count_lines WHERE id = ?`, [line.id]);
}

/**
 * Net movement quantity strictly AFTER this line's own snapshot watermark —
 * a movement id, not a timestamp (SQLite's CURRENT_TIMESTAMP is only
 * second-precise, which would otherwise hide a same-second sale). Excludes
 * this count's own posting movements so a POSTED count's stored variance
 * is never recomputed with itself folded back in.
 */
async function movementsSince(db, { variantId, locationId, batchId, watermark }) {
  const batchClause = batchId == null ? 'AND batch_id IS NULL' : 'AND batch_id = ?';
  const params = batchId == null
    ? [variantId, locationId, watermark]
    : [variantId, locationId, batchId, watermark];
  const row = await db.get(
    `SELECT COALESCE(SUM(quantity), 0) AS net FROM inventory_movements
      WHERE variant_id = ? AND location_id = ? ${batchClause} AND id > ?
        AND NOT (reference_type = 'retail_stock_count_post')`,
    params
  );
  return Number(row?.net || 0);
}

/**
 * Fresh reconciled variance for every line — safe to call any time (review
 * screen, pre-post check). For an already-POSTED count this returns the
 * values frozen at post time instead of recomputing (recomputing after
 * posting would fold the count's own posting movements back into "since").
 */
export async function getStockCountVariance(db, countId) {
  await ensureRetailStockCountsSchema(db);
  const count = await loadCount(db, countId);
  const out = [];
  for (const line of count.lines) {
    const identities = line.tracking_mode === 'serial' ? {
      expectedSerials: (line.serials || []).filter((row) => Number(row.expected)).map((row) => row.serial_number),
      countedSerials: (line.serials || []).filter((row) => Number(row.counted)).map((row) => row.serial_number),
      missingSerials: (line.serials || []).filter((row) => Number(row.expected) && !Number(row.counted)).map((row) => row.serial_number),
      unexpectedSerials: (line.serials || []).filter((row) => !Number(row.expected) && Number(row.counted)).map((row) => row.serial_number),
    } : {};
    if (line.physical_quantity == null) { out.push({ ...line, ...identities, reconciledExpected: null, variance: null, valueVariance: null }); continue; }
    if (count.status === 'POSTED') {
      out.push({ ...line, ...identities, reconciledExpected: line.reconciled_expected_quantity, variance: line.variance, valueVariance: line.value_variance });
      continue;
    }
    const netSince = await movementsSince(db, { variantId: line.variant_id, locationId: count.location_id, batchId: line.batch_id, watermark: line.snapshot_movement_id });
    const reconciledExpected = round3(Number(line.expected_quantity) + netSince);
    const variance = round3(Number(line.physical_quantity) - reconciledExpected);
    const { averageCost } = await getMovingAverageCost(db, line.variant_id);
    out.push({ ...line, ...identities, reconciledExpected, variance, valueVariance: round2(variance * averageCost) });
  }
  return { ...count, lines: out };
}

/** COUNTING -> REVIEW. Requires every line to have a physical tally recorded. */
export async function completeCounting(db, countId, { completedBy = null } = {}) {
  await ensureRetailStockCountsSchema(db);
  return db.transaction(async (tx) => {
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    const count = await tx.get(`SELECT * FROM retail_stock_counts WHERE id = ?${lock}`, [countId]);
    if (!count) throw bad('Stock count not found.', 404);
    if (count.status === 'REVIEW' || count.status === 'POSTED') return loadCount(tx, countId);
    if (count.status !== 'COUNTING') throw bad(`Cannot complete counting from status ${count.status}.`, 409);
    const uncounted = await tx.get(`SELECT COUNT(*) AS n FROM retail_stock_count_lines WHERE retail_stock_count_id = ? AND physical_quantity IS NULL`, [countId]);
    if (Number(uncounted?.n) > 0) throw bad(`${uncounted.n} item(s) still need a physical count before review.`, 409);
    await tx.run(`UPDATE retail_stock_counts SET status = 'REVIEW', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [countId]);
    return loadCount(tx, countId);
  });
}

/**
 * REVIEW -> POSTED. Recomputes variance one final time atomically (a sale
 * between review and approval still gets folded in correctly), applies one
 * inventory movement per non-zero-variance line, and posts a single compound
 * journal for the whole count.
 */
export async function postStockCount(db, countId, { approvedBy = null } = {}) {
  await ensureRetailStockCountsSchema(db);
  return db.transaction(async (tx) => {
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    const count = await tx.get(`SELECT * FROM retail_stock_counts WHERE id = ?${lock}`, [countId]);
    if (!count) throw bad('Stock count not found.', 404);
    if (count.status === 'POSTED') return loadCount(tx, countId); // idempotent replay
    if (count.status !== 'REVIEW') throw bad(`Cannot post a count in status ${count.status} — complete counting and review first.`, 409);

    const lines = await tx.all(`SELECT * FROM retail_stock_count_lines WHERE retail_stock_count_id = ?`, [countId]);
    let gainValue = 0;
    let lossValue = 0;
    for (const line of lines) {
      const netSince = await movementsSince(tx, { variantId: line.variant_id, locationId: count.location_id, batchId: line.batch_id, watermark: line.snapshot_movement_id });
      const reconciledExpected = round3(Number(line.expected_quantity) + netSince);
      const variance = round3(Number(line.physical_quantity) - reconciledExpected);
      let valueVariance = 0;
      const variant = await tx.get(`SELECT tracking_mode FROM menu_item_variants WHERE id=?`, [line.variant_id]);
      if (variant?.tracking_mode === 'serial') {
        const moved = await tx.get(`SELECT COUNT(*) AS n FROM inventory_movements WHERE variant_id=? AND location_id=? AND id>?`,
          [line.variant_id, count.location_id, line.snapshot_movement_id]);
        if (Number(moved?.n)) throw bad('Serialized stock moved after this count started. Start a fresh count to verify current identities.', 409);
        const identities = await tx.all(`SELECT serial_number,expected,counted FROM retail_stock_count_line_serials
          WHERE retail_stock_count_line_id=? ORDER BY serial_number`, [line.id]);
        const expected = identities.filter((row) => Number(row.expected)).map((row) => row.serial_number);
        const live = await tx.all(`SELECT serial_number FROM inventory_serials WHERE variant_id=? AND location_id=?
          AND status IN ('IN_STOCK','QUARANTINE') ORDER BY serial_number`, [line.variant_id, count.location_id]);
        if (expected.length !== Number(line.expected_quantity) || expected.join('\n') !== live.map((row) => row.serial_number).join('\n'))
          throw bad('Serialized stock differs from the count snapshot. Start a fresh count.', 409);
        const missing = identities.filter((row) => Number(row.expected) && !Number(row.counted)).map((row) => row.serial_number);
        const unexpected = identities.filter((row) => !Number(row.expected) && Number(row.counted)).map((row) => row.serial_number);
        if (missing.length - unexpected.length !== -variance) throw bad('Serial identities do not explain the counted variance.', 409);
        if (missing.length) {
          const applied = await applySerialStockChange(tx, { variantId: line.variant_id, locationId: count.location_id,
            serialNumbers: missing, direction: 'out', movementType: 'STOCK_ADJUSTMENT_OUT',
            referenceType: 'retail_stock_count_post', referenceId: line.id, createdBy: approvedBy,
            endingStatus: 'MISSING', reason: `Missing in stock count ${count.count_number}` });
          const value = round2(Number(applied.movement.total_cost || 0));
          lossValue = round2(lossValue + value); valueVariance -= value;
        }
        if (unexpected.length) {
          const { averageCost } = await getMovingAverageCost(tx, line.variant_id);
          const applied = await applySerialStockChange(tx, { variantId: line.variant_id, locationId: count.location_id,
            serialNumbers: unexpected, direction: 'in', unitCost: averageCost, movementType: 'STOCK_ADJUSTMENT_IN',
            referenceType: 'retail_stock_count_post', referenceId: line.id, createdBy: approvedBy,
            reason: `Found in stock count ${count.count_number}` });
          const value = round2(Number(applied.movement.total_cost || 0));
          gainValue = round2(gainValue + value); valueVariance += value;
        }
        valueVariance = round2(valueVariance);
      } else if (Math.abs(variance) > 0.0005) {
        if (variance > 0) {
          const { averageCost } = await getMovingAverageCost(tx, line.variant_id);
          const applied = await receiveStock(tx, {
            variantId: line.variant_id, locationId: count.location_id, batchId: line.batch_id,
            quantity: variance, unitCost: averageCost, movementType: 'STOCK_ADJUSTMENT_IN',
            referenceType: 'retail_stock_count_post', referenceId: line.id, createdBy: approvedBy,
            reason: `Stock count ${count.count_number}`,
          });
          valueVariance = round2(Number(applied.movement.total_cost || 0));
          gainValue = round2(gainValue + valueVariance);
        } else {
          const [applied] = await issueStock(tx, {
            variantId: line.variant_id, locationId: count.location_id, batchId: line.batch_id,
            quantity: Math.abs(variance), movementType: 'STOCK_ADJUSTMENT_OUT',
            referenceType: 'retail_stock_count_post', referenceId: line.id, createdBy: approvedBy,
            reason: `Stock count ${count.count_number}`, allowNegative: true,
          });
          valueVariance = -round2(Number(applied.movement.total_cost || 0));
          lossValue = round2(lossValue + Math.abs(valueVariance));
        }
      }
      await tx.run(
        `UPDATE retail_stock_count_lines SET reconciled_expected_quantity = ?, variance = ?, value_variance = ? WHERE id = ?`,
        [reconciledExpected, variance, valueVariance, line.id]
      );
    }

    if (gainValue > 0.005 || lossValue > 0.005) {
      const day = await currentBusinessDayId(tx, { required: true });
      const journalLines = [];
      if (lossValue > 0.005) {
        journalLines.push({ code: '5040', debit: lossValue, credit: 0, memo: `Stock count shrinkage — ${count.count_number}` });
      }
      if (gainValue > 0.005) {
        journalLines.push({ code: '5042', debit: 0, credit: gainValue, memo: `Stock count gain — ${count.count_number}` });
      }
      // Balance the compound entry against 1210 for the net effect.
      const net = round2(gainValue - lossValue);
      if (net > 0.005) journalLines.push({ code: '1210', debit: net, credit: 0, memo: `Stock count net gain — ${count.count_number}` });
      else if (net < -0.005) journalLines.push({ code: '1210', debit: 0, credit: Math.abs(net), memo: `Stock count net loss — ${count.count_number}` });
      await postJournal(tx, {
        memo: `Stock count posted — ${count.count_number}`,
        source_type: 'retail_stock_count', source_id: countId,
        created_by: approvedBy, business_day_id: day,
        lines: journalLines,
      });
    }

    await tx.run(
      `UPDATE retail_stock_counts SET status = 'POSTED', approved_by = ?, posted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [approvedBy, countId]
    );
    return loadCount(tx, countId);
  });
}

export async function cancelStockCount(db, countId) {
  await ensureRetailStockCountsSchema(db);
  return db.transaction(async (tx) => {
    const count = await tx.get(`SELECT * FROM retail_stock_counts WHERE id = ?`, [countId]);
    if (!count) throw bad('Stock count not found.', 404);
    if (count.status === 'POSTED') throw bad('A posted count cannot be cancelled.', 409);
    await tx.run(`UPDATE retail_stock_counts SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [countId]);
    return loadCount(tx, countId);
  });
}
