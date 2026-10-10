/** Reservations hold canonical sellable stock without physical or financial postings. */
import { ensureColumn } from '@/lib/db/schema-helpers.js';
import { lockRetailStock } from '@/lib/retail-stock-lock.js';
import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import { ensureRetailInventorySchema, getSellableStock } from '@/lib/retail-inventory.js';

const bad = (message, status = 400) => Object.assign(new Error(message), { status });

export async function ensureRetailReservationSchema(db) {
  await ensureRetailInventorySchema(db);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS inventory_reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    source_type TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await ensureColumn(db,'inventory_reservations','expires_at','TIMESTAMP');
  await ensureSqliteTable(db, `CREATE INDEX IF NOT EXISTS idx_inventory_reservations_variant ON inventory_reservations(variant_id, location_id, status)`);
  await ensureSqliteTable(db, `CREATE INDEX IF NOT EXISTS idx_inventory_reservations_source ON inventory_reservations(source_type, source_id)`);
}

export async function getReservedQuantity(db, variantId, locationId) {
  await ensureRetailReservationSchema(db);
  const row = await db.get(
    `SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory_reservations WHERE variant_id = ? AND location_id = ? AND status = 'ACTIVE' AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)`,
    [variantId, locationId]
  );
  return Number(row?.total || 0);
}

export async function getAvailableToSell(db, variantId, locationId) {
  const [sellable, reserved] = await Promise.all([
    getSellableStock(db, variantId, { locationId }),
    getReservedQuantity(db, variantId, locationId),
  ]);
  return Math.max(0, sellable - reserved);
}

/**
 * Locks the inventory_balances row (same lock issueStock's postMovement
 * takes) before checking available_to_sell — this is the serialization
 * point described in the file header.
 */
async function lockBalanceRow(db, variantId, locationId) {
  const lock = db.driver === 'postgres' ? ' FOR UPDATE' : '';
  await db.get(`SELECT id FROM inventory_balances WHERE variant_id = ? AND location_id = ?${lock}`, [variantId, locationId]);
}

export async function createReservation(db, { variantId, locationId, quantity, sourceType, sourceId, createdBy = null, expiresAt = null }) {
  await ensureRetailReservationSchema(db);
  const qty = Number(quantity);
  if (!Number.isFinite(qty)||!(qty > 0)) throw bad('Reservation quantity must be positive.');
  await lockRetailStock(db,[variantId],locationId);
  await lockBalanceRow(db, variantId, locationId);
  const available = await getAvailableToSell(db, variantId, locationId);
  if (qty > available + 0.0005) {
    throw Object.assign(new Error(`Only ${available} available to sell — cannot reserve ${qty}.`), { status: 409, code: 'insufficient_stock' });
  }
  const result = await db.run(
    `INSERT INTO inventory_reservations (variant_id, location_id, quantity, status, source_type, source_id, created_by, expires_at)
     VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`,
    [variantId, locationId, qty, sourceType, sourceId, createdBy, expiresAt]
  );
  return db.get(`SELECT * FROM inventory_reservations WHERE id = ?`, [result.lastInsertRowid]);
}

/** Order cancelled — release every active reservation it held. */
export async function releaseReservations(db, { sourceType, sourceId }) {
  await ensureRetailReservationSchema(db);
  await db.run(`UPDATE inventory_reservations SET status = 'RELEASED', updated_at = CURRENT_TIMESTAMP WHERE source_type = ? AND source_id = ? AND status = 'ACTIVE'`, [sourceType, sourceId]);
}

/** Order fulfilled into a real sale — the reservation's job is done, no reservation should remain. */
export async function consumeReservations(db, { sourceType, sourceId }) {
  await ensureRetailReservationSchema(db);
  await db.run(`UPDATE inventory_reservations SET status = 'CONSUMED', updated_at = CURRENT_TIMESTAMP WHERE source_type = ? AND source_id = ? AND status = 'ACTIVE'`, [sourceType, sourceId]);
}

export async function listReservationsForSource(db, sourceType, sourceId) {
  await ensureRetailReservationSchema(db);
  return db.all(`SELECT * FROM inventory_reservations WHERE source_type = ? AND source_id = ? ORDER BY id`, [sourceType, sourceId]);
}
