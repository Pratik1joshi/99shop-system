import { summarizeMovements } from '@/lib/inventory-money.js';
/**
 * Retail inventory "exceptions" — damage, expiry write-off, tester/sample/
 * internal-use consumption, shrinkage, manual correction, and quarantine
 * move/release. Every quantity change routes through
 * lib/retail-inventory.js's receiveStock/issueStock — this file only decides
 * WHICH movement type and WHICH journal, never touches balances directly.
 *
 * ── WRITE-OFF POLICY: IMMEDIATE, NOT A PENDING-APPROVAL STAGE ─────────────
 * Damage/expiry/tester/sample/internal-use/shrinkage all post immediately
 * when called — there is no separate DRAFT/approve step here. The spec's
 * "prefer a controlled workflow if practical" is satisfied by permission
 * gating (route layer: retail_inventory.damage / .expiry / .tester / ... —
 * only authorized roles can call these at all) plus quarantine already being
 * available as an explicit pending-review holding state: a manager who wants
 * a review step routes suspect stock through moveToQuarantine() first, then
 * decides DAMAGE/EXPIRY (write off) or releaseFromQuarantine() (restore)
 * once inspected — a second draft/approve layer on top of that would be
 * ceremony without a different outcome, so it was not built.
 *
 * ── ACCOUNTING SPLIT: TWO EXPENSE ACCOUNTS, NOT ONE ───────────────────────
 * 5040 "Wastage / Inventory Loss" — DAMAGE, EXPIRY, SHRINKAGE, manual
 *   negative adjustment: stock that is gone and nobody chose that outcome.
 * 5041 "Marketing & Sample Consumption" — TESTER, SAMPLE, INTERNAL_USE:
 *   stock the business deliberately consumed for a business reason. Keeping
 *   these apart (spec §40) means a wastage report isn't diluted by
 *   deliberate marketing spend, and vice versa.
 * A positive manual adjustment (found stock) posts Dr 1210 / Cr 5042
 * "Inventory Gain / Adjustment" — see recordManualAdjustment for its cost
 * basis policy.
 *
 * ── QUARANTINE MOVE/RELEASE: LOCATION CHANGE, NOT A WRITE-OFF ─────────────
 * Moving stock to/from Quarantine never posts a journal — it is a pure
 * TRANSFER_OUT/TRANSFER_IN location change (same movement types the transfer
 * domain uses), direct (no In-Transit hop — this is an instant same-store
 * reclassification, not a multi-day shipment). Total inventory valuation is
 * unchanged; only sellability changes. Economic write-off only happens when
 * someone later calls recordDamage/recordExpiry against that quarantined
 * stock — a deliberate, separate, audited event (spec §33/§43).
 *
 * ── POSITIVE-ADJUSTMENT COST BASIS ────────────────────────────────────────
 * Found stock has no receipt to price it from. recordManualAdjustment prices
 * an increase at the variant's CURRENT moving-average cost unless the caller
 * (an authorized user) explicitly supplies unitCost — never zero-cost by
 * default, which would silently understate the Inventory Asset the moment
 * the found units are later sold or written off.
 *
 * ── IDEMPOTENCY ───────────────────────────────────────────────────────────
 * Every record* function takes an optional idempotencyKey. The header row is
 * created (and its id used as inventory_movements.reference_id) BEFORE the
 * movement posts, so a repeat call with the same key returns the existing
 * header untouched rather than posting twice or a movement no caller can
 * trace back to its own document.
 */

import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import {
  ensureRetailInventorySchema, receiveStock, issueStock, getMovingAverageCost, getDefaultLocation, getQuarantineLocation,
} from '@/lib/retail-inventory.js';
import { postJournal } from '@/lib/accounting.js';
import { ensureDocumentNumberSchema, nextDocumentNumber } from '@/lib/document-numbers.js';
import { currentBusinessDayId } from '@/lib/business-days.js';
import { applySerialStockChange, reclassifySerials } from '@/lib/retail-serials.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

export const ADJUSTMENT_TYPES = [
  'DAMAGE', 'EXPIRY', 'TESTER', 'SAMPLE', 'INTERNAL_USE', 'SHRINKAGE',
  'MANUAL_POSITIVE', 'MANUAL_NEGATIVE', 'QUARANTINE_MOVE', 'QUARANTINE_RELEASE',
];
export const MANUAL_REASONS = ['DAMAGE', 'EXPIRY', 'SHRINKAGE', 'THEFT', 'FOUND_STOCK', 'COUNT_VARIANCE', 'DATA_CORRECTION', 'OTHER'];

const LOSS_MOVEMENT = { DAMAGE: 'DAMAGE', EXPIRY: 'EXPIRY', SHRINKAGE: 'SHRINKAGE' };
const CONSUMPTION_MOVEMENT = { TESTER: 'TESTER', SAMPLE: 'SAMPLE', INTERNAL_USE: 'INTERNAL_USE' };

export async function ensureRetailInventoryAdjustmentsSchema(db) {
  await ensureRetailInventorySchema(db);
  await ensureDocumentNumberSchema(db);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_inventory_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    adjustment_number TEXT UNIQUE,
    type TEXT NOT NULL,
    variant_id INTEGER NOT NULL,
    location_id INTEGER,
    destination_location_id INTEGER,
    batch_id INTEGER,
    quantity NUMERIC(14,3) NOT NULL,
    unit_cost NUMERIC(14,4),
    total_value NUMERIC(14,2),
    reason TEXT,
    notes TEXT,
    idempotency_key TEXT UNIQUE,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function findByIdempotencyKey(tx, idempotencyKey) {
  if (!idempotencyKey) return null;
  return tx.get(`SELECT * FROM retail_inventory_adjustments WHERE idempotency_key = ?`, [idempotencyKey]);
}

async function trackingMode(tx, variantId) {
  const variant = await tx.get(`SELECT tracking_mode FROM menu_item_variants WHERE id=?`, [variantId]);
  if (!variant) throw bad('Product variant not found.', 404);
  return variant.tracking_mode;
}

function requireSerialCount(serialNumbers, quantity) {
  if (!Array.isArray(serialNumbers) || serialNumbers.length !== Math.abs(Number(quantity)) ||
      serialNumbers.some((s) => !String(s).trim()) || new Set(serialNumbers.map((s) => String(s).trim())).size !== serialNumbers.length)
    throw bad('Enter one distinct serial identity for each unit.', 409);
}

async function insertHeader(tx, { type, variantId, locationId, destinationLocationId = null, batchId, quantity, reason, notes, createdBy, idempotencyKey }) {
  const adjustmentNumber = await nextDocumentNumber(tx, { type: 'retail_inventory_adjustment', prefix: 'ADJ' });
  const result = await tx.run(
    `INSERT INTO retail_inventory_adjustments
       (adjustment_number, type, variant_id, location_id, destination_location_id, batch_id, quantity, reason, notes, idempotency_key, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [adjustmentNumber, type, variantId, locationId, destinationLocationId, batchId, quantity, reason, notes, idempotencyKey, createdBy]
  );
  return tx.get(`SELECT * FROM retail_inventory_adjustments WHERE id = ?`, [result.lastInsertRowid]);
}

async function finalizeHeader(tx, headerId, { unitCost, totalValue }) {
  await tx.run(`UPDATE retail_inventory_adjustments SET unit_cost = ?, total_value = ? WHERE id = ?`, [unitCost, totalValue, headerId]);
  return tx.get(`SELECT * FROM retail_inventory_adjustments WHERE id = ?`, [headerId]);
}

async function postLossOrConsumption(db, { type, variantId, locationId, batchId, quantity, serialNumbers = null, reason, notes, createdBy, businessDayId, expenseAccount, idempotencyKey }) {
  const qty = Number(quantity);
  if (!(qty > 0)) throw bad('Quantity must be positive.');
  const movementType = LOSS_MOVEMENT[type] || CONSUMPTION_MOVEMENT[type];
  await ensureRetailInventoryAdjustmentsSchema(db);

  return db.transaction(async (tx) => {
    const existing = await findByIdempotencyKey(tx, idempotencyKey);
    if (existing) return existing;
    const serial = await trackingMode(tx, variantId) === 'serial';
    if (serial) requireSerialCount(serialNumbers, qty);

    const location = locationId || (await getDefaultLocation(tx))?.id;
    const header = await insertHeader(tx, { type, variantId, locationId: location, batchId, quantity: qty, reason, notes, createdBy, idempotencyKey });
    const applied = serial ? await applySerialStockChange(tx, { variantId, locationId: location, serialNumbers,
      direction: 'out', movementType, referenceType: 'retail_inventory_adjustment', referenceId: header.id,
      endingStatus: type === 'DAMAGE' || type === 'EXPIRY' ? 'DAMAGED' : ['TESTER','SAMPLE','INTERNAL_USE'].includes(type) ? 'CONSUMED' : 'MISSING',
      createdBy, reason: reason || type }) : summarizeMovements(await issueStock(tx, {
      variantId, locationId: location, batchId, quantity: qty, movementType,
      referenceType: 'retail_inventory_adjustment', referenceId: header.id, reason: reason || type, createdBy,
    }));
    const value = round2(Number(applied.movement.total_cost || 0));
    const finalized = await finalizeHeader(tx, header.id, { unitCost: applied.movement.unit_cost, totalValue: value });

    if (value > 0.005) {
      const day = businessDayId || await currentBusinessDayId(tx, { required: true });
      await postJournal(tx, {
        memo: `${type} — ${header.adjustment_number}${reason ? `: ${reason}` : ''}`,
        source_type: 'retail_inventory_adjustment', source_id: header.id,
        created_by: createdBy, business_day_id: day,
        lines: [
          { code: expenseAccount, debit: value, credit: 0, memo: type },
          { code: '1210', debit: 0, credit: value, memo: 'Retail Inventory' },
        ],
      });
    }
    return finalized;
  });
}

export async function recordDamage(db, opts) {
  return postLossOrConsumption(db, { ...opts, type: 'DAMAGE', expenseAccount: '5040' });
}

/** Rejects a batch that has not actually expired — expiry write-off is not a generic damage shortcut. */
export async function recordExpiry(db, opts) {
  if (opts.batchId) {
    await ensureRetailInventoryAdjustmentsSchema(db);
    const batch = await db.get(`SELECT expiry_date FROM inventory_batches WHERE id = ?`, [opts.batchId]);
    const today = new Date().toISOString().slice(0, 10);
    if (!batch?.expiry_date || batch.expiry_date >= today) {
      throw bad('This batch has not expired — use recordDamage/recordManualAdjustment for non-expiry write-offs.', 400);
    }
  }
  return postLossOrConsumption(db, { ...opts, type: 'EXPIRY', expenseAccount: '5040' });
}

export async function recordShrinkage(db, opts) {
  return postLossOrConsumption(db, { ...opts, type: 'SHRINKAGE', expenseAccount: '5040' });
}

export async function recordTester(db, opts) {
  return postLossOrConsumption(db, { ...opts, type: 'TESTER', expenseAccount: '5041' });
}

export async function recordSample(db, opts) {
  return postLossOrConsumption(db, { ...opts, type: 'SAMPLE', expenseAccount: '5041' });
}

export async function recordInternalUse(db, opts) {
  return postLossOrConsumption(db, { ...opts, type: 'INTERNAL_USE', expenseAccount: '5041' });
}

/**
 * Signed manual correction. Positive = found stock (priced at current moving
 * average unless an authorized unitCost override is supplied); negative =
 * unexplained shortage, same accounting as DAMAGE/SHRINKAGE (5040).
 */
export async function recordManualAdjustment(db, opts) {
  const { variantId, locationId = null, batchId = null, quantity, serialNumbers = null, reason, notes = null, createdBy = null, businessDayId = null, unitCost = null, idempotencyKey = null } = opts;
  const qty = Number(quantity);
  if (!qty) throw bad('Quantity cannot be zero.');
  if (!MANUAL_REASONS.includes(reason)) throw bad(`Unknown adjustment reason "${reason}".`);
  await ensureRetailInventoryAdjustmentsSchema(db);

  return db.transaction(async (tx) => {
    const existing = await findByIdempotencyKey(tx, idempotencyKey);
    if (existing) return existing;
    const serial = await trackingMode(tx, variantId) === 'serial';
    if (serial) requireSerialCount(serialNumbers, qty);

    const location = locationId || (await getDefaultLocation(tx))?.id;
    const type = qty > 0 ? 'MANUAL_POSITIVE' : 'MANUAL_NEGATIVE';
    const header = await insertHeader(tx, { type, variantId, locationId: location, batchId, quantity: qty, reason, notes, createdBy, idempotencyKey });

    let value; let appliedUnitCost;
    if (qty > 0) {
      const { averageCost } = await getMovingAverageCost(tx, variantId);
      const costBasis = unitCost != null ? Number(unitCost) : averageCost;
      const applied = serial ? await applySerialStockChange(tx, { variantId, locationId: location,
        serialNumbers, direction: 'in', unitCost: costBasis, movementType: 'STOCK_ADJUSTMENT_IN',
        referenceType: 'retail_inventory_adjustment', referenceId: header.id, createdBy, reason }) : await receiveStock(tx, {
        variantId, locationId: location, batchId, quantity: qty, unitCost: costBasis,
        movementType: 'STOCK_ADJUSTMENT_IN', referenceType: 'retail_inventory_adjustment', referenceId: header.id, reason, createdBy,
      });
      value = round2(Number(applied.movement.total_cost || 0));
      appliedUnitCost = applied.movement.unit_cost;
    } else {
      const applied = serial ? await applySerialStockChange(tx, { variantId, locationId: location,
        serialNumbers, direction: 'out', movementType: 'STOCK_ADJUSTMENT_OUT',
        referenceType: 'retail_inventory_adjustment', referenceId: header.id, createdBy, reason,
        endingStatus: reason === 'DAMAGE' || reason === 'EXPIRY' ? 'DAMAGED' : 'MISSING' }) : summarizeMovements(await issueStock(tx, {
        variantId, locationId: location, batchId, quantity: Math.abs(qty),
        movementType: 'STOCK_ADJUSTMENT_OUT', referenceType: 'retail_inventory_adjustment', referenceId: header.id, reason, createdBy,
      }));
      value = round2(Number(applied.movement.total_cost || 0));
      appliedUnitCost = applied.movement.unit_cost;
    }

    const finalized = await finalizeHeader(tx, header.id, { unitCost: appliedUnitCost, totalValue: value });

    if (value > 0.005) {
      const day = businessDayId || await currentBusinessDayId(tx, { required: true });
      const lines = qty > 0
        ? [{ code: '1210', debit: value, credit: 0, memo: 'Retail Inventory' }, { code: '5042', debit: 0, credit: value, memo: `Manual adjustment — ${reason}` }]
        : [{ code: '5040', debit: value, credit: 0, memo: `Manual adjustment — ${reason}` }, { code: '1210', debit: 0, credit: value, memo: 'Retail Inventory' }];
      await postJournal(tx, {
        memo: `Inventory adjustment — ${header.adjustment_number}: ${reason}`,
        source_type: 'retail_inventory_adjustment', source_id: header.id,
        created_by: createdBy, business_day_id: day, lines,
      });
    }
    return finalized;
  });
}

async function moveLocation(db, { type, variantId, batchId, quantity, serialNumbers = null, fromLocationId, toLocationId, notes, createdBy, idempotencyKey }) {
  const qty = Number(quantity);
  if (!(qty > 0)) throw bad('Quantity must be positive.');
  if (Number(fromLocationId) === Number(toLocationId)) throw bad('Source and destination must differ.');
  await ensureRetailInventoryAdjustmentsSchema(db);

  return db.transaction(async (tx) => {
    const existing = await findByIdempotencyKey(tx, idempotencyKey);
    if (existing) return existing;
    const serial = await trackingMode(tx, variantId) === 'serial';
    if (serial) requireSerialCount(serialNumbers, qty);

    const header = await insertHeader(tx, { type, variantId, locationId: fromLocationId, destinationLocationId: toLocationId, batchId, quantity: qty, reason: type, notes, createdBy, idempotencyKey });
    const outLeg = serial ? await reclassifySerials(tx, { variantId, fromLocationId, toLocationId,
      serialNumbers, referenceType: 'retail_inventory_adjustment', referenceId: header.id, createdBy, reason: type }) : summarizeMovements(await issueStock(tx, {
      variantId, locationId: fromLocationId, batchId, quantity: qty, movementType: 'TRANSFER_OUT',
      referenceType: 'retail_inventory_adjustment', referenceId: header.id, createdBy, reason: type,
    }));
    if (!serial) await receiveStock(tx, {
      variantId, locationId: toLocationId, batchId, quantity: qty, movementType: 'TRANSFER_IN',
      referenceType: 'retail_inventory_adjustment', referenceId: header.id, createdBy, reason: type,
    });
    return finalizeHeader(tx, header.id, { unitCost: outLeg.movement.unit_cost, totalValue: 0 });
  });
}

export async function moveToQuarantine(db, { variantId, batchId = null, quantity, serialNumbers = null, fromLocationId = null, notes = null, createdBy = null, idempotencyKey = null }) {
  const quarantine = await getQuarantineLocation(db);
  const source = fromLocationId || (await getDefaultLocation(db))?.id;
  return moveLocation(db, { type: 'QUARANTINE_MOVE', variantId, batchId, quantity, serialNumbers, fromLocationId: source, toLocationId: quarantine.id, notes, createdBy, idempotencyKey });
}

export async function releaseFromQuarantine(db, { variantId, batchId = null, quantity, serialNumbers = null, toLocationId = null, notes = null, createdBy = null, idempotencyKey = null }) {
  const quarantine = await getQuarantineLocation(db);
  const destination = toLocationId || (await getDefaultLocation(db))?.id;
  return moveLocation(db, { type: 'QUARANTINE_RELEASE', variantId, batchId, quantity, serialNumbers, fromLocationId: quarantine.id, toLocationId: destination, notes, createdBy, idempotencyKey });
}

export async function getAdjustment(db, id) {
  await ensureRetailInventoryAdjustmentsSchema(db);
  return db.get(
    `SELECT a.*, v.variant_name, mi.name AS product_name, sl.name AS location_name, dl.name AS destination_location_name, ib.batch_number
       FROM retail_inventory_adjustments a
       LEFT JOIN menu_item_variants v ON v.id = a.variant_id
       LEFT JOIN menu_items mi ON mi.id = v.menu_item_id
       LEFT JOIN inventory_locations sl ON sl.id = a.location_id
       LEFT JOIN inventory_locations dl ON dl.id = a.destination_location_id
       LEFT JOIN inventory_batches ib ON ib.id = a.batch_id
      WHERE a.id = ?`,
    [id]
  );
}

export async function listAdjustments(db, { type = null, limit = 200 } = {}) {
  await ensureRetailInventoryAdjustmentsSchema(db);
  const where = type ? `WHERE a.type = ?` : '';
  const params = type ? [type, Math.min(500, Math.max(1, Number(limit) || 200))] : [Math.min(500, Math.max(1, Number(limit) || 200))];
  return db.all(
    `SELECT a.*, v.variant_name, mi.name AS product_name, sl.name AS location_name, dl.name AS destination_location_name
       FROM retail_inventory_adjustments a
       LEFT JOIN menu_item_variants v ON v.id = a.variant_id
       LEFT JOIN menu_items mi ON mi.id = v.menu_item_id
       LEFT JOIN inventory_locations sl ON sl.id = a.location_id
       LEFT JOIN inventory_locations dl ON dl.id = a.destination_location_id
       ${where}
      ORDER BY a.id DESC LIMIT ?`,
    params
  );
}
