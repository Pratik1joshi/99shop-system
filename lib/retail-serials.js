/**
 * Serial-number lifecycle for tracking_mode='serial' variants (high-value
 * accessories/electronics/warranty items) — NONE/BATCH were already live;
 * this completes SERIAL. Layered on top of lib/retail-inventory.js exactly
 * the way inventory_batches is: `inventory_balances`/`inventory_movements`
 * stay the ONE quantity source of truth (receiveStock/issueStock, called
 * unmodified, batch_id left NULL for serial mode); `inventory_serials` adds
 * per-unit IDENTITY on top, never a second quantity ledger. A serial-tracked
 * variant's on-hand count and its count of IN_STOCK serial rows must always
 * agree — that agreement is a derived fact from this layering, not
 * separately maintained state.
 *
 * Serial numbers are unique across the whole business (not just within a
 * variant) — spec explicit. Cosmetics/general retail is untouched: nothing
 * here runs unless a variant is actually tracking_mode='serial'.
 */

import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import { receiveStock, issueStock } from '@/lib/retail-inventory.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });

export const SERIAL_STATUSES = ['IN_STOCK', 'RESERVED', 'SOLD', 'RETURNED', 'QUARANTINE', 'DAMAGED', 'MISSING', 'CONSUMED', 'RETURNED_TO_SUPPLIER', 'WARRANTY_SERVICE', 'WARRANTY_SUPPLIER'];

export async function ensureRetailSerialsSchema(db) {
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_return_serial_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_line_id INTEGER NOT NULL,
    serial_id INTEGER NOT NULL,
    UNIQUE (return_line_id, serial_id)
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS inventory_serials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL,
    serial_number TEXT NOT NULL UNIQUE,
    location_id INTEGER,
    status TEXT NOT NULL DEFAULT 'IN_STOCK',
    supplier_id INTEGER,
    reference_type TEXT,
    reference_id INTEGER,
    unit_cost NUMERIC(14,4),
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sold_at TIMESTAMP,
    sale_line_id INTEGER,
    returned_at TIMESTAMP,
    warranty_months INTEGER,
    warranty_end_date DATE,
    warranty_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await ensureSqliteTable(db, `CREATE INDEX IF NOT EXISTS idx_inventory_serials_variant ON inventory_serials(variant_id)`);
  await ensureSqliteTable(db, `CREATE INDEX IF NOT EXISTS idx_inventory_serials_status ON inventory_serials(status)`);
  // Captured at GRN DRAFT time, same as goods_receipt_line_batches — the
  // actual inventory_serials rows are only created when the GRN posts.
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS goods_receipt_line_serials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goods_receipt_line_id INTEGER NOT NULL,
    serial_number TEXT NOT NULL
  )`);
}

function dedupe(serials) {
  const clean = (serials || []).map((s) => String(s).trim()).filter(Boolean);
  const unique = [...new Set(clean)];
  if (unique.length !== clean.length) throw bad('Duplicate serial numbers were entered.');
  return unique;
}

/** Applies one audited quantity movement to the exact physical identities.
 * Call within the owning document's transaction so identity and stock cannot
 * diverge on failure. A found serial must be globally new; a removed serial
 * must currently be available at the selected location. */
export async function applySerialStockChange(db, { variantId, locationId, serialNumbers, direction, movementType,
  referenceType, referenceId, unitCost = null, endingStatus = 'MISSING', createdBy = null, reason = null }) {
  await ensureRetailSerialsSchema(db);
  const serials = dedupe(serialNumbers);
  if (!serials.length) throw bad('Select the exact serial identities.');
  const location = await db.get(`SELECT code FROM inventory_locations WHERE id=?`, [locationId]);
  if (!location) throw bad('Inventory location not found.', 404);
  const lock = db.driver === 'postgres' ? ' FOR UPDATE' : '';
  for (const serial of serials) {
    const row = await db.get(`SELECT id,variant_id,location_id,status FROM inventory_serials WHERE serial_number=?${lock}`, [serial]);
    if (direction === 'in') {
      if (row) throw bad(`Serial "${serial}" already exists. Resolve its existing history before adding stock.`, 409);
    } else {
      if (!row || Number(row.variant_id) !== Number(variantId) || Number(row.location_id) !== Number(locationId) ||
        !['IN_STOCK', 'QUARANTINE'].includes(row.status)) throw bad(`Serial "${serial}" is not available at this location.`, 409);
    }
  }
  if (direction === 'in') {
    const applied = await receiveStock(db, { variantId, locationId, quantity: serials.length, unitCost,
      movementType, referenceType, referenceId, createdBy, reason });
    for (const serial of serials) await db.run(`INSERT INTO inventory_serials
      (variant_id,serial_number,location_id,status,unit_cost,reference_type,reference_id)
      VALUES (?,?,?,?,?,?,?)`, [variantId, serial, locationId, location.code === 'QUARANTINE' ? 'QUARANTINE' : 'IN_STOCK',
      applied.movement.unit_cost, referenceType, referenceId]);
    return applied;
  }
  const [applied] = await issueStock(db, { variantId, locationId, quantity: serials.length,
    movementType, referenceType, referenceId, createdBy, reason });
  for (const serial of serials) await db.run(`UPDATE inventory_serials SET status=?,updated_at=CURRENT_TIMESTAMP WHERE serial_number=?`, [endingStatus, serial]);
  return applied;
}

/** Immediate, audited quarantine reclassification. Company inventory value is unchanged. */
export async function reclassifySerials(db, { variantId, fromLocationId, toLocationId, serialNumbers,
  referenceType, referenceId, createdBy = null, reason = null }) {
  await ensureRetailSerialsSchema(db);
  const serials = dedupe(serialNumbers);
  if (!serials.length) throw bad('Select the exact serial identities.');
  const source = await db.get(`SELECT code FROM inventory_locations WHERE id=?`, [fromLocationId]);
  const destination = await db.get(`SELECT code FROM inventory_locations WHERE id=?`, [toLocationId]);
  if (!source || !destination || source.code === destination.code) throw bad('Choose distinct valid locations.');
  const requiredStatus = source.code === 'QUARANTINE' ? 'QUARANTINE' : 'IN_STOCK';
  const endingStatus = destination.code === 'QUARANTINE' ? 'QUARANTINE' : 'IN_STOCK';
  const lock = db.driver === 'postgres' ? ' FOR UPDATE' : '';
  for (const serial of serials) {
    const row = await db.get(`SELECT variant_id,location_id,status FROM inventory_serials WHERE serial_number=?${lock}`, [serial]);
    if (!row || Number(row.variant_id) !== Number(variantId) || Number(row.location_id) !== Number(fromLocationId) || row.status !== requiredStatus)
      throw bad(`Serial "${serial}" is not available at the source location.`, 409);
  }
  const [out] = await issueStock(db, { variantId, locationId: fromLocationId, quantity: serials.length,
    movementType: 'TRANSFER_OUT', referenceType, referenceId, createdBy, reason });
  await receiveStock(db, { variantId, locationId: toLocationId, quantity: serials.length,
    movementType: 'TRANSFER_IN', referenceType, referenceId, createdBy, reason });
  for (const serial of serials) await db.run(`UPDATE inventory_serials SET status=?,location_id=?,updated_at=CURRENT_TIMESTAMP WHERE serial_number=?`,
    [endingStatus, toLocationId, serial]);
  return out;
}

/**
 * Registers N unique serials as IN_STOCK and also posts the ordinary
 * receiveStock() movement (quantity = serials.length, no batch) — the two
 * always happen together, never one without the other.
 */
export async function registerSerialsOnReceipt(db, { variantId, locationId, serialNumbers, unitCost = null, totalValue = null, supplierId = null, referenceType = null, referenceId = null, businessDayId = null, createdBy = null, reason = null }) {
  await ensureRetailSerialsSchema(db);
  const serials = dedupe(serialNumbers);
  if (!serials.length) throw bad('At least one serial number is required.');
  for (const s of serials) {
    const existing = await db.get(`SELECT id FROM inventory_serials WHERE serial_number = ?`, [s]);
    if (existing) throw bad(`Serial "${s}" already exists in the system — serial numbers must be globally unique.`, 409);
  }
  const applied = await receiveStock(db, {
    variantId, locationId, quantity: serials.length, unitCost, totalValue, movementType: 'PURCHASE_RECEIPT',
    referenceType, referenceId, reason, businessDayId, createdBy,
  });
  for (const s of serials) {
    await db.run(
      `INSERT INTO inventory_serials (variant_id, serial_number, location_id, status, supplier_id, reference_type, reference_id, unit_cost)
       VALUES (?, ?, ?, 'IN_STOCK', ?, ?, ?, ?)`,
      [variantId, s, locationId, supplierId, referenceType, referenceId, unitCost]
    );
  }
  return { serials, movement: applied.movement };
}

/**
 * Sells exact serials — each must be IN_STOCK, belong to this variant, and
 * be at the selling location. Row-locked so the same serial can never be
 * sold twice, even from two concurrent checkouts (Postgres FOR UPDATE).
 */
export async function allocateSerialsForSale(db, { variantId, locationId, serialNumbers, saleLineId, movementType = 'SALE', referenceType = 'retail_sale_line', referenceId = null, businessDayId = null, createdBy = null, reason = null }) {
  await ensureRetailSerialsSchema(db);
  const serials = dedupe(serialNumbers);
  if (!serials.length) throw bad('Select the exact serial(s) being sold.');
  const lock = db.driver === 'postgres' ? ' FOR UPDATE' : '';
  for (const s of serials) {
    const row = await db.get(`SELECT * FROM inventory_serials WHERE serial_number = ?${lock}`, [s]);
    if (!row) throw bad(`Serial "${s}" not found.`, 404);
    if (Number(row.variant_id) !== Number(variantId)) throw bad(`Serial "${s}" does not belong to this product.`, 400);
    if (row.status !== 'IN_STOCK') throw bad(`Serial "${s}" is not available for sale (status: ${row.status}).`, 409);
    if (locationId && Number(row.location_id) !== Number(locationId)) throw bad(`Serial "${s}" is not at the selling location.`, 409);
  }
  const applied = await issueStock(db, {
    variantId, locationId, quantity: serials.length, movementType, referenceType, referenceId: referenceId ?? saleLineId,
    businessDayId, createdBy, reason,
  });
  for (const s of serials) {
    await db.run(
      `UPDATE inventory_serials SET status = 'SOLD', sale_line_id = ?, sold_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE serial_number = ?`,
      [saleLineId, s]
    );
  }
  return { serials, applied };
}

/**
 * Returns a specific serial. Rejects a serial that was never sold on
 * `originalSaleLineId` (spec explicit — no returning a serial that wasn't
 * actually part of that sale).
 */
export async function returnSerial(db, { serialNumber, originalSaleLineId, returnLineId, disposition = 'IN_STOCK', locationId, unitCost = null, totalValue = null, businessDayId = null, createdBy = null }) {
  await ensureRetailSerialsSchema(db);
  if (!Number.isSafeInteger(Number(returnLineId)) || Number(returnLineId) <= 0) throw bad('A stable return line identity is required.');
  // The caller owns the transaction. Lock identity before replay detection so
  // concurrent retries cannot insert two events or mutate a later sale's state.
  const lock = db.driver === 'postgres' ? ' FOR UPDATE' : '';
  const row = await db.get(`SELECT * FROM inventory_serials WHERE serial_number = ?${lock}`, [String(serialNumber).trim()]);
  if (!row) throw bad(`Serial "${serialNumber}" not found.`, 404);
  const line = await db.get(`SELECT original_sale_line_id,variant_id FROM retail_return_lines WHERE id=?`, [returnLineId]);
  if (!line || Number(line.original_sale_line_id) !== Number(originalSaleLineId) || Number(line.variant_id) !== Number(row.variant_id)) {
    throw bad('Serial return event does not match the original sale line.');
  }
  const event = await db.get(`SELECT id FROM retail_return_serial_events WHERE return_line_id=? AND serial_id=?`, [returnLineId, row.id]);
  if (event) return row;
  if (Number(row.sale_line_id) !== Number(originalSaleLineId)) {
    throw bad(`Serial "${serialNumber}" was not sold on this sale line.`, 400);
  }
  if (!['IN_STOCK', 'QUARANTINE', 'DAMAGED'].includes(disposition)) throw bad(`Unknown return disposition "${disposition}".`);
  if (row.status !== 'SOLD') throw bad(`Serial "${serialNumber}" is not sold (status: ${row.status}).`, 409);
  const inserted = await db.run(`INSERT INTO retail_return_serial_events (return_line_id,serial_id) VALUES (?,?)`, [returnLineId, row.id]);
  await receiveStock(db, {
    variantId: row.variant_id, locationId, quantity: 1, unitCost, totalValue, movementType: 'CUSTOMER_RETURN',
    referenceType: 'retail_return_serial_event', referenceId: inserted.lastInsertRowid, businessDayId, createdBy,
  });
  await db.run(
    `UPDATE inventory_serials SET status = ?, location_id = ?, returned_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [disposition, locationId, row.id]
  );
  return row;
}

/** Supplier return — removes the exact serial, never "a" unit. */
export async function returnSerialToSupplier(db, { serialNumber, receiptLineId = null, returnLineId = null, locationId = null, businessDayId = null, createdBy = null }) {
  await ensureRetailSerialsSchema(db);
  const row = await db.get(`SELECT * FROM inventory_serials WHERE serial_number = ?`, [String(serialNumber).trim()]);
  if (!row) throw bad(`Serial "${serialNumber}" not found.`, 404);
  if (row.status !== 'IN_STOCK') throw bad(`Serial "${serialNumber}" is not in stock (status: ${row.status}).`, 409);
  if (receiptLineId && (row.reference_type !== 'goods_receipt_line' || Number(row.reference_id) !== Number(receiptLineId))) {
    throw bad(`Serial "${serialNumber}" was not received on this receipt line.`, 409);
  }
  if (locationId && Number(row.location_id) !== Number(locationId)) throw bad(`Serial "${serialNumber}" is not at the return location.`, 409);
  const applied = await issueStock(db, {
    variantId: row.variant_id, locationId: row.location_id, quantity: 1, movementType: 'PURCHASE_RETURN',
    referenceType: returnLineId ? 'purchase_return_line_serial' : 'purchase_return_serial',
    referenceId: returnLineId ? (await db.get(`SELECT id FROM purchase_return_line_serials WHERE purchase_return_line_id=? AND serial_number=?`, [returnLineId, serialNumber]))?.id : row.id,
    businessDayId, createdBy,
  });
  await db.run(`UPDATE inventory_serials SET status = 'RETURNED_TO_SUPPLIER', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [row.id]);
  return { ...row, applied };
}

/** Moves an exact serial between locations — total company quantity unchanged, identity preserved. */
export async function transferSerial(db, { serialNumber, fromLocationId, toLocationId, referenceType = 'retail_transfer_serial', referenceId = null, businessDayId = null, createdBy = null }) {
  await ensureRetailSerialsSchema(db);
  const row = await db.get(`SELECT * FROM inventory_serials WHERE serial_number = ?`, [String(serialNumber).trim()]);
  if (!row) throw bad(`Serial "${serialNumber}" not found.`, 404);
  if (row.status !== 'IN_STOCK') throw bad(`Serial "${serialNumber}" is not available to transfer (status: ${row.status}).`, 409);
  if (Number(row.location_id) !== Number(fromLocationId)) throw bad(`Serial "${serialNumber}" is not at the source location.`, 409);
  await issueStock(db, { variantId: row.variant_id, locationId: fromLocationId, quantity: 1, movementType: 'TRANSFER_OUT', referenceType, referenceId: referenceId ?? row.id, businessDayId, createdBy });
  await receiveStock(db, { variantId: row.variant_id, locationId: toLocationId, quantity: 1, movementType: 'TRANSFER_IN', referenceType, referenceId: referenceId ?? row.id, businessDayId, createdBy });
  await db.run(`UPDATE inventory_serials SET location_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [toLocationId, row.id]);
  return row;
}

export async function setWarranty(db, { serialNumber, warrantyMonths, warrantyNotes }) {
  await ensureRetailSerialsSchema(db);
  const row = await db.get(`SELECT * FROM inventory_serials WHERE serial_number = ?`, [String(serialNumber).trim()]);
  if (!row) throw bad(`Serial "${serialNumber}" not found.`, 404);
  const months = Math.max(0, parseInt(warrantyMonths, 10) || 0);
  const base = row.sold_at || new Date().toISOString();
  const end = months > 0 ? new Date(new Date(base).getTime() + months * 30 * 86400000).toISOString().slice(0, 10) : null;
  await db.run(`UPDATE inventory_serials SET warranty_months = ?, warranty_end_date = ?, warranty_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [months || null, end, warrantyNotes || null, row.id]);
  return db.get(`SELECT * FROM inventory_serials WHERE id = ?`, [row.id]);
}

export async function getSerial(db, serialNumber) {
  await ensureRetailSerialsSchema(db);
  return db.get(
    `SELECT s.*, v.variant_name, mi.name AS product_name, sl.product_name_snapshot, sl.retail_sale_id,
            rs.sale_number, rs.customer_id, c.name AS customer_name
       FROM inventory_serials s
       LEFT JOIN product_variants v ON v.id = s.variant_id
       LEFT JOIN products mi ON mi.id = v.product_id
       LEFT JOIN retail_sale_lines sl ON sl.id = s.sale_line_id
       LEFT JOIN retail_sales rs ON rs.id = sl.retail_sale_id
       LEFT JOIN customers c ON c.id = rs.customer_id
      WHERE s.serial_number = ?`,
    [String(serialNumber).trim()]
  );
}

// Supplier swaps customer-owned property held for service. Neither serial is a
// retailer inventory asset, so this identity transition posts no quantity/value.
export async function replaceCustomerServiceSerial(db,{oldSerial,newSerial,claimId,supplierId}) {
  const suffix=db.driver==='postgres'?' FOR UPDATE':'';
  const original=await db.get(`SELECT * FROM inventory_serials WHERE serial_number=?${suffix}`,[oldSerial]);
  const serial=String(newSerial||'').trim();
  if(!original||original.status!=='WARRANTY_SUPPLIER'||!serial||serial.length>120)throw bad('An outstanding customer-owned supplier serial and a new serial are required.',409);
  if(await db.get('SELECT id FROM inventory_serials WHERE serial_number=?',[serial]))throw bad('Replacement serial already exists.',409);
  await db.run("INSERT INTO inventory_serials(variant_id,serial_number,status,supplier_id,sale_line_id,reference_type,reference_id) VALUES (?,?,'WARRANTY_SERVICE',?,?,'warranty_supplier_customer',?)",[original.variant_id,serial,supplierId,original.sale_line_id,claimId]);
  await db.run("UPDATE inventory_serials SET status='RETURNED_TO_SUPPLIER',updated_at=CURRENT_TIMESTAMP WHERE id=?",[original.id]);
  return serial;
}

export async function listSerialsForVariant(db, variantId, { status = null, locationId = null } = {}) {
  await ensureRetailSerialsSchema(db);
  const clauses = ['variant_id = ?'];
  const params = [variantId];
  if (status) { clauses.push('status = ?'); params.push(status); }
  if (locationId) { clauses.push('location_id = ?'); params.push(locationId); }
  return db.all(`SELECT * FROM inventory_serials WHERE ${clauses.join(' AND ')} ORDER BY received_at`, params);
}
