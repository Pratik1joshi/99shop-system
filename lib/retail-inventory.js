/**
 * Retail inventory: variant + location + batch stock.
 *
 * inventory_locations, inventory_batches, inventory_balances (current state)
 * and inventory_movements (audit ledger) — see migration 075. Expiry-tracked
 * batches and more than one stockroom are both supported.
 *
 * Every exported mutator here never opens its own transaction. Callers wrap
 * in db.transaction().
 */

import { ensureColumn } from '@/lib/db/schema-helpers.js';
import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import { ensureSupplierSchema } from '@/lib/suppliers.js';
import { cents, money, proportionalValue } from '@/lib/inventory-money.js';
import { inventoryValuationView } from '@/lib/inventory-valuation-view.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const TRACKING_MODES = ['none', 'batch', 'serial'];

export const MOVEMENT_TYPES = [
  'OPENING_STOCK', 'PURCHASE_RECEIPT', 'SALE', 'CUSTOMER_RETURN', 'PURCHASE_RETURN',
  'TRANSFER_OUT', 'TRANSFER_IN', 'STOCK_ADJUSTMENT_IN', 'STOCK_ADJUSTMENT_OUT',
  'DAMAGE', 'EXPIRY', 'LOSS', 'SHRINKAGE', 'TESTER', 'SAMPLE', 'INTERNAL_USE',
];

// Movement types whose quantity must be positive (stock in) vs negative (stock out).
const INBOUND_TYPES = new Set(['OPENING_STOCK', 'PURCHASE_RECEIPT', 'CUSTOMER_RETURN', 'TRANSFER_IN', 'STOCK_ADJUSTMENT_IN']);
const OUTBOUND_TYPES = new Set([
  'SALE', 'PURCHASE_RETURN', 'TRANSFER_OUT', 'STOCK_ADJUSTMENT_OUT',
  'DAMAGE', 'EXPIRY', 'LOSS', 'SHRINKAGE', 'TESTER', 'SAMPLE', 'INTERNAL_USE',
]);

let ENSURED = false;

export async function ensureRetailInventorySchema(db) {
  // inventory_batches references suppliers — guarantee the table exists on
  // SQLite (Postgres already has it from the migrations).
  await ensureSupplierSchema(db);

  await ensureSqliteTable(
    db,
    `CREATE TABLE IF NOT EXISTS inventory_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER,
      name TEXT NOT NULL,
      code TEXT,
      location_type TEXT NOT NULL DEFAULT 'shop',
      is_default INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await ensureSqliteTable(
    db,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_locations_one_default
       ON inventory_locations((1)) WHERE is_default = 1`
  );
  await ensureSqliteTable(
    db,
    `CREATE TABLE IF NOT EXISTS inventory_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id) ON DELETE CASCADE,
      batch_number TEXT NOT NULL,
      manufactured_date DATE,
      expiry_date DATE,
      supplier_id INTEGER REFERENCES suppliers(id),
      purchase_id INTEGER,
      unit_cost NUMERIC(14,2),
      status TEXT NOT NULL DEFAULT 'active',
      received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(variant_id, batch_number)
    )`
  );
  await ensureSqliteTable(
    db,
    `CREATE TABLE IF NOT EXISTS inventory_balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id) ON DELETE CASCADE,
      location_id INTEGER NOT NULL REFERENCES inventory_locations(id),
      batch_id INTEGER REFERENCES inventory_batches(id),
      quantity_on_hand NUMERIC(14,3) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await ensureSqliteTable(
    db,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_balances_with_batch
       ON inventory_balances(variant_id, location_id, batch_id) WHERE batch_id IS NOT NULL`
  );
  await ensureSqliteTable(
    db,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_balances_no_batch
       ON inventory_balances(variant_id, location_id) WHERE batch_id IS NULL`
  );
  await ensureSqliteTable(
    db,
    `CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id) ON DELETE CASCADE,
      location_id INTEGER NOT NULL REFERENCES inventory_locations(id),
      batch_id INTEGER REFERENCES inventory_batches(id),
      movement_type TEXT NOT NULL,
      quantity NUMERIC(14,3) NOT NULL,
      balance_after NUMERIC(14,3),
      unit_cost NUMERIC(14,2),
      total_cost NUMERIC(14,2),
      reference_type TEXT,
      reference_id INTEGER,
      reason TEXT,
      business_day_id INTEGER,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );
  await ensureSqliteTable(
    db,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movements_dedupe_batch
       ON inventory_movements(variant_id, location_id, batch_id, movement_type, reference_type, reference_id)
       WHERE batch_id IS NOT NULL AND reference_type IS NOT NULL AND reference_id IS NOT NULL`
  );
  await ensureSqliteTable(
    db,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movements_dedupe_nobatch
       ON inventory_movements(variant_id, location_id, movement_type, reference_type, reference_id)
       WHERE batch_id IS NULL AND reference_type IS NOT NULL AND reference_id IS NOT NULL`
  );
  await ensureSqliteTable(
    db,
    `CREATE TABLE IF NOT EXISTS inventory_costs (
      variant_id INTEGER PRIMARY KEY REFERENCES menu_item_variants(id) ON DELETE CASCADE,
      average_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
      quantity_on_hand NUMERIC(14,3) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );

  await ensureColumn(db, 'menu_item_variants', 'tracking_mode', "TEXT NOT NULL DEFAULT 'none'");
  await ensureColumn(db, 'inventory_costs', 'carrying_value', 'NUMERIC(14,2)');
  await ensureColumn(db, 'inventory_costs', 'baseline_value', 'NUMERIC(14,2) NOT NULL DEFAULT 0');
  await ensureColumn(db, 'inventory_costs', 'baseline_movement_id', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'inventory_movements', 'carrying_value_delta', 'NUMERIC(14,2)');
  await ensureSqliteTable(db, inventoryValuationView);
  if (db.driver !== 'postgres') await db.run(`UPDATE inventory_costs SET carrying_value=ROUND(quantity_on_hand*average_cost,2),
    baseline_value=ROUND(quantity_on_hand*average_cost,2),baseline_movement_id=COALESCE((SELECT MAX(id) FROM inventory_movements),0) WHERE carrying_value IS NULL`);
  await ensureColumn(db, 'menu_item_variants', 'reorder_point', 'NUMERIC(14,2)');
  await ensureColumn(db, 'menu_item_variants', 'reorder_quantity', 'NUMERIC(14,2)');
  // Phase 5: getSellableStock()/getSellableBatches() below only ever checked
  // batch status — a location itself could never be excluded. A quarantine/
  // returns-holding location needs real on-hand quantity (honest inventory)
  // but must never count as sellable or be offered to FEFO.
  await ensureColumn(db, 'inventory_locations', 'is_sellable', 'INTEGER NOT NULL DEFAULT 1');

  if (!ENSURED) {
    const existingDefault = await db.get(`SELECT id FROM inventory_locations WHERE is_default = 1 LIMIT 1`);
    if (!existingDefault) {
      await db.run(
        `INSERT INTO inventory_locations (name, code, location_type, is_default, is_active) VALUES (?, ?, ?, 1, 1)`,
        ['Main Store', 'MAIN', 'shop']
      );
    }
    const existingQuarantine = await db.get(`SELECT id FROM inventory_locations WHERE code = 'QUARANTINE'`);
    if (!existingQuarantine) {
      await db.run(
        `INSERT INTO inventory_locations (name, code, location_type, is_sellable, is_active) VALUES (?, ?, ?, 0, 1)`,
        ['Returns Quarantine', 'QUARANTINE', 'damaged']
      );
    }
    // Phase 6: a shared holding location for dispatched-but-not-yet-received
    // transfer stock. Movements are tagged with reference_type/reference_id
    // back to the specific transfer, so pooling non-batch quantity here is
    // safe (fungible) and batch-tracked stock is always drawn back out by its
    // exact batch_id — never FEFO — so concurrent transfers of the same
    // variant never cross-contaminate each other's receipt.
    const existingTransit = await db.get(`SELECT id FROM inventory_locations WHERE code = 'IN_TRANSIT'`);
    if (!existingTransit) {
      await db.run(
        `INSERT INTO inventory_locations (name, code, location_type, is_sellable, is_active) VALUES (?, ?, ?, 0, 1)`,
        ['In Transit', 'IN_TRANSIT', 'in_transit']
      );
    }
    ENSURED = true;
  }
}

export async function getQuarantineLocation(db) {
  await ensureRetailInventorySchema(db);
  return db.get(`SELECT * FROM inventory_locations WHERE code = 'QUARANTINE' LIMIT 1`);
}

export async function getInTransitLocation(db) {
  await ensureRetailInventorySchema(db);
  return db.get(`SELECT * FROM inventory_locations WHERE code = 'IN_TRANSIT' LIMIT 1`);
}

export async function getDefaultLocation(db) {
  await ensureRetailInventorySchema(db);
  return db.get(`SELECT * FROM inventory_locations WHERE is_default = 1 LIMIT 1`);
}

export async function listLocations(db, { activeOnly = true } = {}) {
  await ensureRetailInventorySchema(db);
  return db.all(
    `SELECT * FROM inventory_locations ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY is_default DESC, name`
  );
}

export async function createLocation(db, { name, code = null, locationType = 'shop', branchId = null }) {
  await ensureRetailInventorySchema(db);
  const clean = String(name || '').trim();
  if (!clean) throw new Error('Location name required');
  const result = await db.run(
    `INSERT INTO inventory_locations (name, code, location_type, branch_id) VALUES (?, ?, ?, ?)`,
    [clean, code || null, locationType, branchId]
  );
  return db.get(`SELECT * FROM inventory_locations WHERE id = ?`, [result.lastInsertRowid]);
}

async function getVariant(db, variantId) {
  const variant = await db.get(`SELECT * FROM menu_item_variants WHERE id = ?`, [variantId]);
  if (!variant) throw Object.assign(new Error(`Variant ${variantId} not found`), { status: 404 });
  return variant;
}

/** Reuses a batch already on this variant with the same batch_number, else creates it. */
export async function getOrCreateBatch(db, { variantId, batchNumber, manufacturedDate = null, expiryDate = null, supplierId = null, purchaseId = null, unitCost = null }) {
  await ensureRetailInventorySchema(db);
  const number = String(batchNumber || '').trim();
  if (!number) throw new Error('batchNumber required for a batch-tracked variant');

  const existing = await db.get(
    `SELECT * FROM inventory_batches WHERE variant_id = ? AND batch_number = ?`,
    [variantId, number]
  );
  if (existing) return existing;

  const result = await db.run(
    `INSERT INTO inventory_batches
       (variant_id, batch_number, manufactured_date, expiry_date, supplier_id, purchase_id, unit_cost)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [variantId, number, manufacturedDate, expiryDate, supplierId, purchaseId, unitCost]
  );
  return db.get(`SELECT * FROM inventory_batches WHERE id = ?`, [result.lastInsertRowid]);
}

/**
 * The one write path for inventory_balances + inventory_movements. Every
 * exported mutator below funnels through this. Never opens its own
 * transaction — pass a tx-scoped db when the caller has one open.
 */
async function postMovement(db, opts) {
  const {
    variantId, locationId, batchId = null, movementType, quantity,
    unitCost = null, totalValue = null, referenceType = null, referenceId = null, reason = null,
    businessDayId = null, createdBy = null, allowNegative = false,
  } = opts;

  if (!MOVEMENT_TYPES.includes(movementType)) throw new Error(`Unknown movement_type "${movementType}"`);
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty === 0) throw new Error('quantity must be a non-zero number');
  if (INBOUND_TYPES.has(movementType) && qty < 0) throw new Error(`${movementType} requires a positive quantity`);
  if (OUTBOUND_TYPES.has(movementType) && qty > 0) throw new Error(`${movementType} requires a negative quantity`);

  if (referenceType && referenceId != null) {
    const dupQuery = batchId == null
      ? `SELECT * FROM inventory_movements
          WHERE variant_id = ? AND location_id = ? AND batch_id IS NULL AND movement_type = ?
            AND reference_type = ? AND reference_id = ?`
      : `SELECT * FROM inventory_movements
          WHERE variant_id = ? AND location_id = ? AND batch_id = ? AND movement_type = ?
            AND reference_type = ? AND reference_id = ?`;
    const dupParams = batchId == null
      ? [variantId, locationId, movementType, referenceType, referenceId]
      : [variantId, locationId, batchId, movementType, referenceType, referenceId];
    const dup = await db.get(dupQuery, dupParams);
    if (dup) return { movement: dup, balance: null, idempotentReplay: true };
  }

  const isPg = db.driver === 'postgres';
  const lock = isPg ? ' FOR UPDATE' : '';
  const balanceQuery = batchId == null
    ? `SELECT * FROM inventory_balances WHERE variant_id = ? AND location_id = ? AND batch_id IS NULL${lock}`
    : `SELECT * FROM inventory_balances WHERE variant_id = ? AND location_id = ? AND batch_id = ?${lock}`;
  const balanceParams = batchId == null ? [variantId, locationId] : [variantId, locationId, batchId];
  const existingBalance = await db.get(balanceQuery, balanceParams);

  const from = Number(existingBalance?.quantity_on_hand ?? 0);
  const to = from + qty;
  if (to < 0 && !allowNegative) {
    throw Object.assign(
      new Error(`Insufficient stock: ${from} on hand, cannot apply ${qty}.`),
      { status: 409, code: 'insufficient_stock' }
    );
  }

  if (existingBalance) {
    await db.run(`UPDATE inventory_balances SET quantity_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [to, existingBalance.id]);
  } else {
    await db.run(
      `INSERT INTO inventory_balances (variant_id, location_id, batch_id, quantity_on_hand) VALUES (?, ?, ?, ?)`,
      [variantId, locationId, batchId, to]
    );
  }

  // The monetary pool is authoritative; average cost is derived after each
  // exact currency movement. Never reconstruct value from the cached average.
  const costLock = isPg ? ' FOR UPDATE' : '';
  const existingCost = await db.get(`SELECT * FROM inventory_costs WHERE variant_id = ?${costLock}`, [variantId]);
  const costQtyBefore = Number(existingCost?.quantity_on_hand ?? 0);
  const valueBefore = Number(existingCost?.carrying_value ?? 0);
  const avgBefore = costQtyBefore > 0 ? valueBefore / costQtyBefore : 0;
  const costQtyAfter = Math.round((costQtyBefore + qty) * 1000) / 1000;
  if (costQtyAfter < 0) throw Object.assign(new Error('Cannot allocate carrying value to negative stock.'), { status: 409 });
  let totalCost;
  if (qty < 0) {
    totalCost = proportionalValue(valueBefore, Math.abs(qty), costQtyBefore);
  } else if (movementType === 'TRANSFER_IN') {
    // Matching immutable outbound evidence is the sole source of transfer value.
    const source = await db.get(`SELECT SUM(total_cost) AS value,SUM(-quantity) AS quantity FROM inventory_movements
      WHERE variant_id=? AND movement_type='TRANSFER_OUT' AND reference_type=? AND reference_id=?
      AND ${batchId == null ? 'batch_id IS NULL' : 'batch_id=?'}`,
      [variantId, referenceType, referenceId, ...(batchId == null ? [] : [batchId])]);
    if (!source || Math.abs(Number(source.quantity) - qty) > 0.0005 || source.value == null) throw new Error('Transfer inbound requires matching outbound monetary evidence');
    totalCost = Number(source.value);
  } else {
    totalCost = totalValue == null ? money(cents((unitCost == null ? avgBefore : Number(unitCost)) * qty)) : money(cents(totalValue));
  }
  if (totalCost < 0) throw new Error('Inventory value must be nonnegative');
  const delta = qty > 0 ? cents(totalCost) : -cents(totalCost);
  const valueAfter = money(cents(valueBefore) + delta);
  const avgAfter = costQtyAfter > 0 ? valueAfter / costQtyAfter : 0;
  const postedUnitCost = totalCost / Math.abs(qty);

  if (existingCost) {
    await db.run(`UPDATE inventory_costs SET average_cost = ?, quantity_on_hand = ?, carrying_value=?, updated_at = CURRENT_TIMESTAMP WHERE variant_id = ?`, [avgAfter, costQtyAfter, valueAfter, variantId]);
  } else {
    await db.run(`INSERT INTO inventory_costs (variant_id, average_cost, quantity_on_hand,carrying_value) VALUES (?, ?, ?,?)`, [variantId, avgAfter, costQtyAfter, valueAfter]);
  }

  const result = await db.run(
    `INSERT INTO inventory_movements
       (variant_id, location_id, batch_id, movement_type, quantity, balance_after, unit_cost, total_cost,
        reference_type, reference_id, reason, business_day_id, created_by,carrying_value_delta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)`,
    [variantId, locationId, batchId, movementType, qty, to, postedUnitCost, totalCost,
      referenceType, referenceId, reason, businessDayId, createdBy,money(delta)]
  );

  const movement = await db.get(`SELECT * FROM inventory_movements WHERE id = ?`, [result.lastInsertRowid]);
  return {
    movement,
    balance: { variantId, locationId, batchId, from, to },
    averageCost: { before: avgBefore, after: avgAfter },
    idempotentReplay: false,
  };
}

/** Current moving-average cost + quantity for a variant (the inventory_costs cache, read-only). */
export async function getMovingAverageCost(db, variantId) {
  await ensureRetailInventorySchema(db);
  const row = await db.get(`SELECT * FROM inventory_costs WHERE variant_id = ?`, [variantId]);
  return { averageCost: Number(row?.quantity_on_hand) > 0 ? Number(row.carrying_value) / Number(row.quantity_on_hand) : 0, quantityOnHand: Number(row?.quantity_on_hand ?? 0) };
}

/** Financial valuation is the sum of canonical carrying values. */
export async function getInventoryValuation(db) {
  await ensureRetailInventorySchema(db);
  const rows = await db.all(`SELECT variant_id, average_cost, quantity_on_hand,carrying_value FROM inventory_costs`);
  let total = 0;
  const byVariant = [];
  for (const r of rows) {
    const value = Number(r.carrying_value);
    total = round2(total + value);
    byVariant.push({ variantId: r.variant_id, averageCost: Number(r.average_cost), quantityOnHand: Number(r.quantity_on_hand), value });
  }
  return { total, byVariant };
}

/**
 * Stock coming in (purchase receipt, opening stock, customer return, transfer
 * in, positive adjustment). For a BATCH-tracked variant, batchNumber (or an
 * existing batchId) is required — receiving without a batch on a batch-
 * tracked variant is a caller error, not a silent no-batch fallback.
 */
export async function receiveStock(db, opts) {
  const {
    variantId, locationId = null, quantity, unitCost = null, totalValue = null,
    movementType = 'PURCHASE_RECEIPT', referenceType = null, referenceId = null,
    reason = null, businessDayId = null, createdBy = null,
    batchId = null, batchNumber = null, manufacturedDate = null, expiryDate = null,
    supplierId = null, purchaseId = null,
  } = opts;

  await ensureRetailInventorySchema(db);
  const variant = await getVariant(db, variantId);
  const location = locationId || (await getDefaultLocation(db))?.id;
  if (!location) throw new Error('No inventory location available');

  if (batchId && variant.tracking_mode !== 'batch') {
    throw Object.assign(new Error(`"${variant.variant_name}" is not batch-tracked — cannot receive against a batch.`), { status: 400 });
  }
  let resolvedBatchId = batchId;
  if (variant.tracking_mode === 'batch' && !resolvedBatchId) {
    if (!batchNumber) throw new Error(`"${variant.variant_name}" is batch-tracked — batchNumber is required to receive stock.`);
    const batch = await getOrCreateBatch(db, {
      variantId, batchNumber, manufacturedDate, expiryDate, supplierId, purchaseId,
      unitCost: unitCost ?? null,
    });
    resolvedBatchId = batch.id;
  } else if (resolvedBatchId) {
    const batch = await db.get(`SELECT id FROM inventory_batches WHERE id = ? AND variant_id = ?`, [resolvedBatchId, variantId]);
    if (!batch) throw Object.assign(new Error('Batch does not belong to this variant'), { status: 400 });
  }

  return postMovement(db, {
    variantId, locationId: location, batchId: resolvedBatchId, movementType,
    quantity: Math.abs(Number(quantity)), unitCost, totalValue, referenceType, referenceId,
    reason, businessDayId, createdBy,
  });
}

export async function openingStock(db, opts) {
  return receiveStock(db, { ...opts, movementType: 'OPENING_STOCK' });
}

/**
 * Stock going out (sale, damage, expiry write-off, tester/sample/internal
 * use, transfer out, negative adjustment). BATCH-tracked variants without an
 * explicit batchId are drawn FEFO across sellable batches — see
 * getSellableBatches(). Nothing is applied unless the full quantity can be
 * satisfied (no partial-then-fail state), unless allowNegative is set.
 */
export async function issueStock(db, opts) {
  const {
    variantId, locationId = null, quantity, unitCost = null,
    movementType = 'SALE', referenceType = null, referenceId = null,
    reason = null, businessDayId = null, createdBy = null,
    batchId = null, allowNegative = false,
  } = opts;

  await ensureRetailInventorySchema(db);
  const variant = await getVariant(db, variantId);
  const location = locationId || (await getDefaultLocation(db))?.id;
  if (!location) throw new Error('No inventory location available');

  const need = Math.abs(Number(quantity));
  if (!Number.isFinite(need) || need <= 0) throw new Error('quantity must be positive');

  if (batchId && variant.tracking_mode !== 'batch') {
    throw Object.assign(new Error(`"${variant.variant_name}" is not batch-tracked — cannot issue against a batch.`), { status: 400 });
  }

  if (variant.tracking_mode !== 'batch') {
    const applied = await postMovement(db, {
      variantId, locationId: location, batchId: null, movementType,
      quantity: -need, unitCost, referenceType, referenceId, reason, businessDayId, createdBy, allowNegative,
    });
    return [applied];
  }

  // Batch-tracked: explicit batch, or FEFO across sellable batches.
  if (batchId) {
    const batch = await db.get(`SELECT * FROM inventory_batches WHERE id = ? AND variant_id = ?`, [batchId, variantId]);
    if (!batch) throw Object.assign(new Error('Batch does not belong to this variant'), { status: 400 });
    const applied = await postMovement(db, {
      variantId, locationId: location, batchId, movementType,
      quantity: -need, unitCost: unitCost ?? batch.unit_cost, referenceType, referenceId, reason, businessDayId, createdBy, allowNegative,
    });
    return [applied];
  }

  const sellable = await getSellableBatches(db, variantId, location);
  const totalSellable = sellable.reduce((sum, b) => sum + Number(b.quantity_on_hand || 0), 0);
  if (totalSellable < need && !allowNegative) {
    throw Object.assign(
      new Error(`Insufficient sellable stock for "${variant.variant_name}": need ${need}, ${totalSellable} available (expired/written-off batches excluded).`),
      { status: 409, code: 'insufficient_stock' }
    );
  }

  const applied = [];
  let remaining = need;
  for (const batch of sellable) {
    if (remaining <= 0) break;
    const draw = Math.min(remaining, Number(batch.quantity_on_hand || 0));
    if (draw <= 0) continue;
    applied.push(await postMovement(db, {
      variantId, locationId: location, batchId: batch.batch_id, movementType,
      quantity: -draw, unitCost: unitCost ?? batch.unit_cost, referenceType, referenceId, reason, businessDayId, createdBy,
    }));
    remaining -= draw;
  }
  if (remaining > 0) {
    // allowNegative: draw the rest from the earliest sellable batch (or, with
    // none sellable, the variant has no batch to attach to — reject).
    const fallbackBatch = sellable[0];
    if (!fallbackBatch) throw Object.assign(new Error('No batch available to record negative stock against.'), { status: 409 });
    applied.push(await postMovement(db, {
      variantId, locationId: location, batchId: fallbackBatch.batch_id, movementType,
      quantity: -remaining, unitCost: unitCost ?? fallbackBatch.unit_cost, referenceType, referenceId, reason, businessDayId, createdBy,
      allowNegative: true,
    }));
  }
  return applied;
}

/** Signed adjustment for damage/expiry/loss/shrinkage/tester/sample/internal-use/adjustment. */
export async function adjustStock(db, opts) {
  const { quantity, movementType } = opts;
  if (!movementType) throw new Error('movementType required');
  const qty = Number(quantity);
  if (INBOUND_TYPES.has(movementType)) return receiveStock(db, { ...opts, quantity: Math.abs(qty), movementType });
  return issueStock(db, { ...opts, quantity: Math.abs(qty), movementType });
}

export async function getAvailableStock(db, variantId, { locationId = null } = {}) {
  await ensureRetailInventorySchema(db);
  const row = await db.get(
    `SELECT COALESCE(SUM(quantity_on_hand), 0) AS total
       FROM inventory_balances
      WHERE variant_id = ? ${locationId ? 'AND location_id = ?' : ''}`,
    locationId ? [variantId, locationId] : [variantId]
  );
  return Number(row?.total || 0);
}

/** On-hand minus expired/written-off batches — what can actually be sold right now. */
export async function getSellableStock(db, variantId, { locationId = null } = {}) {
  await ensureRetailInventorySchema(db);
  const today = new Date().toISOString().slice(0, 10);
  const row = await db.get(
    `SELECT COALESCE(SUM(b.quantity_on_hand), 0) AS total
       FROM inventory_balances b
       JOIN inventory_locations loc ON loc.id = b.location_id
       LEFT JOIN inventory_batches ib ON ib.id = b.batch_id
      WHERE b.variant_id = ? AND loc.is_sellable = 1
        ${locationId ? 'AND b.location_id = ?' : ''}
        AND (b.batch_id IS NULL OR (ib.status = 'active' AND (ib.expiry_date IS NULL OR ib.expiry_date >= ?)))`,
    locationId ? [variantId, locationId, today] : [variantId, today]
  );
  return Number(row?.total || 0);
}

/** Sellable stock for many variants in one query — for a POS product list, not one lookup per row. */
export async function getSellableStockBulk(db, variantIds, { locationId = null } = {}) {
  await ensureRetailInventorySchema(db);
  const ids = (variantIds || []).map(Number).filter(Boolean);
  if (!ids.length) return {};
  const today = new Date().toISOString().slice(0, 10);
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT b.variant_id, COALESCE(SUM(b.quantity_on_hand), 0) AS total
       FROM inventory_balances b
       JOIN inventory_locations loc ON loc.id = b.location_id
       LEFT JOIN inventory_batches ib ON ib.id = b.batch_id
      WHERE b.variant_id IN (${placeholders}) AND loc.is_sellable = 1
        ${locationId ? 'AND b.location_id = ?' : ''}
        AND (b.batch_id IS NULL OR (ib.status = 'active' AND (ib.expiry_date IS NULL OR ib.expiry_date >= ?)))
      GROUP BY b.variant_id`,
    locationId ? [...ids, locationId, today] : [...ids, today]
  );
  const map = {};
  for (const r of rows) map[r.variant_id] = Number(r.total);
  return map;
}

export async function getStockByBatch(db, variantId, { locationId = null } = {}) {
  await ensureRetailInventorySchema(db);
  return db.all(
    `SELECT b.*, ib.batch_number, ib.expiry_date, ib.manufactured_date, ib.status AS batch_status
       FROM inventory_balances b
       JOIN inventory_batches ib ON ib.id = b.batch_id
      WHERE b.variant_id = ? ${locationId ? 'AND b.location_id = ?' : ''}
      ORDER BY ib.expiry_date IS NULL, ib.expiry_date, ib.received_at`,
    locationId ? [variantId, locationId] : [variantId]
  );
}

export async function getStockByLocation(db, variantId) {
  await ensureRetailInventorySchema(db);
  return db.all(
    `SELECT l.id AS location_id, l.name AS location_name, COALESCE(SUM(b.quantity_on_hand), 0) AS quantity
       FROM inventory_locations l
       LEFT JOIN inventory_balances b ON b.location_id = l.id AND b.variant_id = ?
      WHERE l.is_active = 1
      GROUP BY l.id, l.name
      ORDER BY l.is_default DESC, l.name`,
    [variantId]
  );
}

/** Active, non-expired batches with stock, FEFO-ordered (earliest expiry first; no-expiry last). */
export async function getSellableBatches(db, variantId, locationId) {
  await ensureRetailInventorySchema(db);
  const today = new Date().toISOString().slice(0, 10);
  return db.all(
    `SELECT b.id AS balance_id, b.batch_id, b.quantity_on_hand, ib.batch_number, ib.expiry_date, ib.unit_cost
       FROM inventory_balances b
       JOIN inventory_batches ib ON ib.id = b.batch_id
       JOIN inventory_locations loc ON loc.id = b.location_id
      WHERE b.variant_id = ? AND b.location_id = ? AND b.quantity_on_hand > 0 AND loc.is_sellable = 1
        AND ib.status = 'active' AND (ib.expiry_date IS NULL OR ib.expiry_date >= ?)
      ORDER BY ib.expiry_date IS NULL, ib.expiry_date, ib.received_at`,
    [variantId, locationId, today]
  );
}

export async function getSuggestedFEFOBatch(db, variantId, locationId, quantityNeeded = 1) {
  const sellable = await getSellableBatches(db, variantId, locationId);
  let remaining = Number(quantityNeeded) || 0;
  const plan = [];
  for (const batch of sellable) {
    if (remaining <= 0) break;
    const draw = Math.min(remaining, Number(batch.quantity_on_hand));
    if (draw <= 0) continue;
    plan.push({ batchId: batch.batch_id, batchNumber: batch.batch_number, expiryDate: batch.expiry_date, quantity: draw });
    remaining -= draw;
  }
  return { plan, fullyCovered: remaining <= 0 };
}

export async function getExpiredStock(db, { locationId = null } = {}) {
  await ensureRetailInventorySchema(db);
  const today = new Date().toISOString().slice(0, 10);
  return db.all(
    `SELECT b.*, ib.batch_number, ib.expiry_date, v.variant_name, v.menu_item_id, mi.name AS product_name
       FROM inventory_balances b
       JOIN inventory_batches ib ON ib.id = b.batch_id
       JOIN menu_item_variants v ON v.id = b.variant_id
       JOIN menu_items mi ON mi.id = v.menu_item_id
      WHERE b.quantity_on_hand > 0 AND ib.status = 'active' AND ib.expiry_date IS NOT NULL AND ib.expiry_date < ?
        ${locationId ? 'AND b.location_id = ?' : ''}
      ORDER BY ib.expiry_date`,
    locationId ? [today, locationId] : [today]
  );
}

export async function getExpiringStock(db, days = 30, { locationId = null } = {}) {
  await ensureRetailInventorySchema(db);
  const today = new Date();
  const until = new Date(today.getTime() + Number(days) * 86400000).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);
  return db.all(
    `SELECT b.*, ib.batch_number, ib.expiry_date, v.variant_name, v.menu_item_id, mi.name AS product_name
       FROM inventory_balances b
       JOIN inventory_batches ib ON ib.id = b.batch_id
       JOIN menu_item_variants v ON v.id = b.variant_id
       JOIN menu_items mi ON mi.id = v.menu_item_id
      WHERE b.quantity_on_hand > 0 AND ib.status = 'active'
        AND ib.expiry_date IS NOT NULL AND ib.expiry_date BETWEEN ? AND ?
        ${locationId ? 'AND b.location_id = ?' : ''}
      ORDER BY ib.expiry_date`,
    locationId ? [todayStr, until, locationId] : [todayStr, until]
  );
}

export async function getMovementHistory(db, variantId, { limit = 100 } = {}) {
  await ensureRetailInventorySchema(db);
  return db.all(
    `SELECT * FROM inventory_movements WHERE variant_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    [variantId, limit]
  );
}

/**
 * Reorder must be judged on SELLABLE stock, not raw on-hand — raw on-hand
 * hides shortage behind quarantined/expired units that can never be sold.
 */
export async function needsReorder(db, variantId) {
  const variant = await getVariant(db, variantId);
  const point = variant.reorder_point;
  if (point == null) return false;
  const sellable = await getSellableStock(db, variantId);
  return sellable <= Number(point);
}
