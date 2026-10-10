/**
 * Retail stock transfers — location A -> In Transit -> location B. Always
 * routes through lib/retail-inventory.js's receiveStock/issueStock (the one
 * write path to inventory_balances/inventory_movements); this file never
 * touches those tables directly.
 *
 * ── WHY AN IN-TRANSIT LOCATION, NOT A DIRECT A->B MOVE ────────────────────
 * Moving stock straight from source to destination in one step would make it
 * simultaneously look "gone from A" and "at B" only if both legs commit
 * atomically — but it would also make a mid-flight audit trail impossible to
 * see (spec explicitly forbids stock being sellable at both ends at once, and
 * partial-receipt/discrepancy handling requires a real "not yet arrived"
 * state to hold the undelivered remainder in). A shared, non-sellable
 * IN_TRANSIT location (see ensureRetailInventorySchema) gives that state for
 * free from the existing location model — no new table needed.
 *
 * Each leg is tagged reference_type/reference_id back to this transfer's
 * line, so lib/retail-inventory.js's existing movement-dedupe index makes
 * double-dispatch/double-receive a no-op replay rather than a duplicate
 * movement — no separate idempotency-key column required.
 *
 * ── WHY ZERO JOURNAL ENTRIES ───────────────────────────────────────────────
 * Costing is a single moving average per variant, not per location. A
 * transfer's OUT leg reduces inventory_costs.quantity_on_hand by the exact
 * amount its IN leg restores (unitCost is never passed on the IN legs — see
 * lib/retail-inventory.js's postMovement), so average_cost is untouched and
 * total company-wide inventory valuation is unchanged by construction. No GL
 * account is location-scoped, so there is nothing for a journal to move
 * between — posting one would fabricate P&L that never happened.
 *
 * ── DISCREPANCY POLICY ────────────────────────────────────────────────────
 * If less arrives than was dispatched, only the quantity actually received is
 * moved out of IN_TRANSIT; the shortfall is left sitting there, untouched,
 * with a required reason/disposition recorded on the line. That is a
 * deliberate design choice (spec explicitly forbids auto-expensing it) — an
 * authorized user later resolves it with an explicit inventory adjustment
 * (lib/retail-inventory-adjustments.js) that is its own audited event.
 */

import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import {
  ensureRetailInventorySchema, receiveStock, issueStock, getInTransitLocation,
} from '@/lib/retail-inventory.js';
import { ensureDocumentNumberSchema, nextDocumentNumber } from '@/lib/document-numbers.js';
import { ensureRetailSerialsSchema, transferSerial } from '@/lib/retail-serials.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });

const DISCREPANCY_DISPOSITIONS = ['SHORT_SHIPMENT', 'DAMAGED_IN_TRANSIT', 'LOST_IN_TRANSIT', 'PENDING_INVESTIGATION'];

let ENSURED = false;

export async function ensureRetailTransfersSchema(db) {
  await ensureRetailInventorySchema(db);
  await ensureDocumentNumberSchema(db);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transfer_number TEXT UNIQUE,
    source_location_id INTEGER NOT NULL,
    destination_location_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    requested_by INTEGER,
    dispatched_by INTEGER,
    received_by INTEGER,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    dispatched_at TIMESTAMP,
    received_at TIMESTAMP,
    notes TEXT,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_transfer_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retail_transfer_id INTEGER NOT NULL,
    variant_id INTEGER NOT NULL,
    batch_id INTEGER,
    requested_quantity NUMERIC(14,3) NOT NULL,
    dispatched_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
    received_quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
    unit_cost_snapshot NUMERIC(14,4),
    discrepancy_reason TEXT,
    discrepancy_disposition TEXT,
    notes TEXT
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_transfer_line_serials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retail_transfer_line_id INTEGER NOT NULL REFERENCES retail_transfer_lines(id) ON DELETE CASCADE,
    serial_number TEXT NOT NULL,
    received_at TIMESTAMP,
    UNIQUE (retail_transfer_line_id, serial_number)
  )`);
  if (!ENSURED) { ENSURED = true; }
}

async function loadTransfer(db, id) {
  const transfer = await db.get(
    `SELECT t.*, sl.name AS source_name, dl.name AS destination_name
       FROM retail_transfers t
       LEFT JOIN inventory_locations sl ON sl.id = t.source_location_id
       LEFT JOIN inventory_locations dl ON dl.id = t.destination_location_id
      WHERE t.id = ?`,
    [id]
  );
  if (!transfer) throw bad('Transfer not found.', 404);
  const lines = await db.all(
    `SELECT tl.*, v.variant_name, v.tracking_mode, mi.name AS product_name, ib.batch_number
       FROM retail_transfer_lines tl
       LEFT JOIN menu_item_variants v ON v.id = tl.variant_id
       LEFT JOIN menu_items mi ON mi.id = v.menu_item_id
       LEFT JOIN inventory_batches ib ON ib.id = tl.batch_id
      WHERE tl.retail_transfer_id = ? ORDER BY tl.id`,
    [id]
  );
  for (const line of lines) {
    line.serials = await db.all(`SELECT id,serial_number,received_at FROM retail_transfer_line_serials WHERE retail_transfer_line_id=? ORDER BY id`, [line.id]);
  }
  return { ...transfer, lines };
}

export async function getTransfer(db, id) {
  await ensureRetailTransfersSchema(db);
  return loadTransfer(db, id);
}

export async function listTransfers(db, { status = null, limit = 200 } = {}) {
  await ensureRetailTransfersSchema(db);
  const where = status ? `WHERE t.status = ?` : '';
  const params = status ? [status, Math.min(500, Math.max(1, Number(limit) || 200))] : [Math.min(500, Math.max(1, Number(limit) || 200))];
  return db.all(
    `SELECT t.*, sl.name AS source_name, dl.name AS destination_name,
            (SELECT COUNT(*) FROM retail_transfer_lines WHERE retail_transfer_id = t.id) AS line_count
       FROM retail_transfers t
       LEFT JOIN inventory_locations sl ON sl.id = t.source_location_id
       LEFT JOIN inventory_locations dl ON dl.id = t.destination_location_id
       ${where}
      ORDER BY t.id DESC LIMIT ?`,
    params
  );
}

/** DRAFT only — no stock movement, no journal. Purely an operational document. */
export async function createTransfer(db, data) {
  const { sourceLocationId, destinationLocationId, requestedBy = null, notes = null, reason = null, lines = [] } = data;
  if (!sourceLocationId || !destinationLocationId) throw bad('Source and destination location are required.');
  if (Number(sourceLocationId) === Number(destinationLocationId)) throw bad('Source and destination must differ.');
  if (!lines.length) throw bad('Add at least one line to transfer.');
  await ensureRetailTransfersSchema(db);

  return db.transaction(async (tx) => {
    await ensureRetailSerialsSchema(tx);
    const claimedSerials = new Set();
    const transferNumber = await nextDocumentNumber(tx, { type: 'retail_transfer', prefix: 'TR' });
    const result = await tx.run(
      `INSERT INTO retail_transfers (transfer_number, source_location_id, destination_location_id, status, requested_by, notes, reason)
       VALUES (?, ?, ?, 'DRAFT', ?, ?, ?)`,
      [transferNumber, sourceLocationId, destinationLocationId, requestedBy, notes, reason]
    );
    const transferId = result.lastInsertRowid;
    for (const l of lines) {
      const qty = Number(l.quantity);
      if (!(qty > 0)) throw bad('Each transfer line needs a positive quantity.');
      const variantId = Number(l.variantId ?? l.variant_id);
      const variant = await tx.get(`SELECT tracking_mode FROM menu_item_variants WHERE id=?`, [variantId]);
      if (!variant) throw bad('Transfer product not found.', 404);
      const batchId = l.batchId ?? l.batch_id ?? null;
      if (variant.tracking_mode === 'batch' && !batchId) throw bad('Choose the exact batch for batch-tracked stock.');
      if (batchId) {
        const batch = await tx.get(`SELECT id FROM inventory_batches WHERE id=? AND variant_id=?`, [batchId, variantId]);
        if (!batch) throw bad('Batch does not belong to the transfer product.');
      }
      const serials = (l.serialNumbers ?? l.serial_numbers ?? []).map((serial) => String(serial).trim()).filter(Boolean);
      if (variant.tracking_mode === 'serial') {
        if (!Number.isInteger(qty) || serials.length !== qty || new Set(serials).size !== serials.length) {
          throw bad('Enter one distinct serial number per transferred unit.');
        }
        for (const serial of serials) {
          if (claimedSerials.has(serial)) throw bad(`Serial ${serial} is on more than one transfer line.`);
          claimedSerials.add(serial);
          const identity = await tx.get(`SELECT status,location_id,variant_id FROM inventory_serials WHERE serial_number=?`, [serial]);
          if (!identity || identity.status !== 'IN_STOCK' || Number(identity.variant_id) !== variantId || Number(identity.location_id) !== Number(sourceLocationId)) {
            throw bad(`Serial ${serial} is not available at the source location.`, 409);
          }
        }
      } else if (serials.length) throw bad('Only serial-tracked products accept serial numbers.');
      const lineResult = await tx.run(
        `INSERT INTO retail_transfer_lines (retail_transfer_id, variant_id, batch_id, requested_quantity, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [transferId, variantId, batchId, qty, l.notes || null]
      );
      for (const serial of serials) await tx.run(`INSERT INTO retail_transfer_line_serials (retail_transfer_line_id,serial_number) VALUES (?,?)`, [lineResult.lastInsertRowid, serial]);
    }
    return loadTransfer(tx, transferId);
  });
}

/** DRAFT only. */
export async function cancelDraftTransfer(db, id, { cancelledBy = null } = {}) {
  await ensureRetailTransfersSchema(db);
  return db.transaction(async (tx) => {
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    const transfer = await tx.get(`SELECT * FROM retail_transfers WHERE id = ?${lock}`, [id]);
    if (!transfer) throw bad('Transfer not found.', 404);
    if (transfer.status === 'CANCELLED') return loadTransfer(tx, id);
    if (transfer.status !== 'DRAFT') throw bad('Only a DRAFT transfer can be cancelled directly — a dispatched transfer needs a reversal.', 409);
    await tx.run(`UPDATE retail_transfers SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    return loadTransfer(tx, id);
  });
}

/**
 * Source (sellable/storage) -> In Transit, batch preserved exactly (never
 * FEFO-resolved here — the batch was chosen at createTransfer time). Row-
 * locked via issueStock's own postMovement lock, so two transfers competing
 * for the same source variant/batch serialize correctly on Postgres.
 */
export async function dispatchTransfer(db, id, { dispatchedBy = null } = {}) {
  await ensureRetailTransfersSchema(db);
  return db.transaction(async (tx) => {
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    const transfer = await tx.get(`SELECT * FROM retail_transfers WHERE id = ?${lock}`, [id]);
    if (!transfer) throw bad('Transfer not found.', 404);
    if (transfer.status === 'DISPATCHED' || transfer.status === 'RECEIVED') return loadTransfer(tx, id); // idempotent replay
    if (transfer.status !== 'DRAFT') throw bad(`Cannot dispatch a transfer in status ${transfer.status}.`, 409);

    const inTransit = await getInTransitLocation(tx);
    const lines = await tx.all(`SELECT * FROM retail_transfer_lines WHERE retail_transfer_id = ?`, [id]);
    for (const line of lines) {
      const qty = Number(line.requested_quantity);
      const variant = await tx.get(`SELECT tracking_mode FROM menu_item_variants WHERE id=?`, [line.variant_id]);
      const serials = variant?.tracking_mode === 'serial' ? await tx.all(`SELECT id,serial_number FROM retail_transfer_line_serials WHERE retail_transfer_line_id=? ORDER BY id`, [line.id]) : [];
      if (variant?.tracking_mode === 'serial' && serials.length !== qty) throw bad('Transfer serial count no longer matches the requested quantity.', 409);
      let unitCost;
      if (serials.length) {
        const cost = await tx.get(`SELECT average_cost FROM inventory_costs WHERE variant_id=?`, [line.variant_id]);
        unitCost = Number(cost?.average_cost || 0);
        for (const serial of serials) await transferSerial(tx, { serialNumber: serial.serial_number,
          fromLocationId: transfer.source_location_id, toLocationId: inTransit.id,
          referenceType: 'retail_transfer_dispatch_serial', referenceId: serial.id, createdBy: dispatchedBy });
      } else {
      const [outLeg] = await issueStock(tx, {
        variantId: line.variant_id, locationId: transfer.source_location_id, batchId: line.batch_id,
        quantity: qty, movementType: 'TRANSFER_OUT',
        referenceType: 'retail_transfer_dispatch', referenceId: line.id, createdBy: dispatchedBy,
      });
      await receiveStock(tx, {
        variantId: line.variant_id, locationId: inTransit.id, batchId: line.batch_id,
        quantity: qty, movementType: 'TRANSFER_IN',
        referenceType: 'retail_transfer_dispatch', referenceId: line.id, createdBy: dispatchedBy,
      });
      unitCost = outLeg.movement.unit_cost;
      }
      await tx.run(
        `UPDATE retail_transfer_lines SET dispatched_quantity = ?, unit_cost_snapshot = ? WHERE id = ?`,
        [qty, unitCost, line.id]
      );
    }
    await tx.run(
      `UPDATE retail_transfers SET status = 'DISPATCHED', dispatched_by = ?, dispatched_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [dispatchedBy, id]
    );
    return loadTransfer(tx, id);
  });
}

/**
 * In Transit -> destination. `lines` (optional) overrides received quantity
 * per line for a partial/short receipt: [{lineId, receivedQuantity,
 * discrepancyReason, discrepancyDisposition}]. Omitted lines receive in full.
 * A shortfall REQUIRES discrepancyReason and is never silently rounded up.
 */
export async function receiveTransfer(db, id, { receivedBy = null, lines: overrides = [] } = {}) {
  await ensureRetailTransfersSchema(db);
  const byLineId = new Map(overrides.map((o) => [Number(o.lineId), o]));

  return db.transaction(async (tx) => {
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    const transfer = await tx.get(`SELECT * FROM retail_transfers WHERE id = ?${lock}`, [id]);
    if (!transfer) throw bad('Transfer not found.', 404);
    if (transfer.status === 'RECEIVED') return loadTransfer(tx, id); // idempotent replay
    if (transfer.status !== 'DISPATCHED') throw bad(`Cannot receive a transfer in status ${transfer.status}.`, 409);

    const inTransit = await getInTransitLocation(tx);
    const dbLines = await tx.all(`SELECT * FROM retail_transfer_lines WHERE retail_transfer_id = ?`, [id]);
    for (const line of dbLines) {
      const variant = await tx.get(`SELECT tracking_mode FROM menu_item_variants WHERE id=?`, [line.variant_id]);
      const override = byLineId.get(line.id);
      const receiveQty = override?.receivedQuantity != null ? Number(override.receivedQuantity) : Number(line.dispatched_quantity);
      if (receiveQty > Number(line.dispatched_quantity) + 0.0005) {
        throw bad(`Cannot receive ${receiveQty} — only ${line.dispatched_quantity} was dispatched.`, 409);
      }
      const shortfall = Number(line.dispatched_quantity) - receiveQty;
      if (shortfall > 0.0005 && !override?.discrepancyReason) {
        throw bad(`Line ${line.id}: received quantity (${receiveQty}) is short of dispatched (${line.dispatched_quantity}) — a reason is required.`, 400);
      }

      const serialRows = variant?.tracking_mode === 'serial' ? await tx.all(`SELECT id,serial_number FROM retail_transfer_line_serials WHERE retail_transfer_line_id=? ORDER BY id`, [line.id]) : [];
      let selectedSerials = [];
      if (variant?.tracking_mode === 'serial') {
        const requested = override?.serialNumbers ?? override?.serial_numbers;
        if (shortfall > 0.0005 && !requested) throw bad('Select the exact serials received for a partial transfer.', 409);
        selectedSerials = requested ? requested.map((serial) => String(serial).trim()) : serialRows.map((row) => row.serial_number);
        if (selectedSerials.length !== receiveQty || new Set(selectedSerials).size !== selectedSerials.length ||
            selectedSerials.some((serial) => !serialRows.some((row) => row.serial_number === serial))) {
          throw bad('Received serials must exactly match the transfer line and quantity.', 409);
        }
      }

      if (receiveQty > 0 && variant?.tracking_mode === 'serial') {
        for (const serialNumber of selectedSerials) {
          const serial = serialRows.find((row) => row.serial_number === serialNumber);
          await transferSerial(tx, { serialNumber, fromLocationId: inTransit.id,
            toLocationId: transfer.destination_location_id, referenceType: 'retail_transfer_receive_serial',
            referenceId: serial.id, createdBy: receivedBy });
          await tx.run(`UPDATE retail_transfer_line_serials SET received_at=CURRENT_TIMESTAMP WHERE id=?`, [serial.id]);
        }
      } else if (receiveQty > 0) {
        await issueStock(tx, {
          variantId: line.variant_id, locationId: inTransit.id, batchId: line.batch_id,
          quantity: receiveQty, movementType: 'TRANSFER_OUT',
          referenceType: 'retail_transfer_receive', referenceId: line.id, createdBy: receivedBy,
        });
        await receiveStock(tx, {
          variantId: line.variant_id, locationId: transfer.destination_location_id, batchId: line.batch_id,
          quantity: receiveQty, movementType: 'TRANSFER_IN',
          referenceType: 'retail_transfer_receive', referenceId: line.id, createdBy: receivedBy,
        });
      }
      await tx.run(
        `UPDATE retail_transfer_lines SET received_quantity = ?, discrepancy_reason = ?, discrepancy_disposition = ? WHERE id = ?`,
        [receiveQty, shortfall > 0.0005 ? override.discrepancyReason : null,
          shortfall > 0.0005 ? (DISCREPANCY_DISPOSITIONS.includes(override?.discrepancyDisposition) ? override.discrepancyDisposition : 'PENDING_INVESTIGATION') : null,
          line.id]
      );
    }
    await tx.run(
      `UPDATE retail_transfers SET status = 'RECEIVED', received_by = ?, received_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [receivedBy, id]
    );
    return loadTransfer(tx, id);
  });
}

/**
 * DISPATCHED only (not yet RECEIVED) — moves whatever remains in IN_TRANSIT
 * for this transfer back to source and marks it CANCELLED. History (the
 * original dispatch movements) is never deleted, only reversed by new,
 * equally-audited movements.
 */
export async function reverseDispatchedTransfer(db, id, { reversedBy = null, reason = null } = {}) {
  if (!reason) throw bad('A reason is required to reverse a dispatched transfer.');
  await ensureRetailTransfersSchema(db);
  return db.transaction(async (tx) => {
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    const transfer = await tx.get(`SELECT * FROM retail_transfers WHERE id = ?${lock}`, [id]);
    if (!transfer) throw bad('Transfer not found.', 404);
    if (transfer.status !== 'DISPATCHED') throw bad(`Only a DISPATCHED transfer can be reversed (status is ${transfer.status}).`, 409);

    const inTransit = await getInTransitLocation(tx);
    const lines = await tx.all(`SELECT * FROM retail_transfer_lines WHERE retail_transfer_id = ?`, [id]);
    for (const line of lines) {
      const stillInTransit = Number(line.dispatched_quantity) - Number(line.received_quantity);
      if (stillInTransit <= 0.0005) continue;
      const variant = await tx.get(`SELECT tracking_mode FROM menu_item_variants WHERE id=?`, [line.variant_id]);
      if (variant?.tracking_mode === 'serial') {
        const serials = await tx.all(`SELECT id,serial_number FROM retail_transfer_line_serials WHERE retail_transfer_line_id=? AND received_at IS NULL`, [line.id]);
        if (serials.length !== stillInTransit) throw bad('In-transit serial count does not match transfer balance.', 409);
        for (const serial of serials) await transferSerial(tx, { serialNumber: serial.serial_number,
          fromLocationId: inTransit.id, toLocationId: transfer.source_location_id,
          referenceType: 'retail_transfer_reverse_serial', referenceId: serial.id, createdBy: reversedBy });
        continue;
      }
      await issueStock(tx, {
        variantId: line.variant_id, locationId: inTransit.id, batchId: line.batch_id,
        quantity: stillInTransit, movementType: 'TRANSFER_OUT',
        referenceType: 'retail_transfer_reverse', referenceId: line.id, createdBy: reversedBy, reason,
      });
      await receiveStock(tx, {
        variantId: line.variant_id, locationId: transfer.source_location_id, batchId: line.batch_id,
        quantity: stillInTransit, movementType: 'TRANSFER_IN',
        referenceType: 'retail_transfer_reverse', referenceId: line.id, createdBy: reversedBy, reason,
      });
    }
    await tx.run(
      `UPDATE retail_transfers SET status = 'CANCELLED', notes = COALESCE(notes || ' | ', '') || ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [`Reversed: ${reason}`, id]
    );
    return loadTransfer(tx, id);
  });
}
