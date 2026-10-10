/**
 * Short, staff-facing document numbers: INV-001, GRN-001, CN-001 and so on.
 *
 * One counter per document type, so numbers run 001, 002, 003 for each kind of
 * document and never restart or collide. These are display/search/print
 * identifiers; internal row ids are unaffected.
 */

import { serialPkSql } from '@/lib/db/schema-helpers.js';

const WIDTH = 3;

export async function ensureDocumentNumberSchema(db) {
  const pk = serialPkSql(db);
  await db.run(`CREATE TABLE IF NOT EXISTS document_counters (
    ${pk},
    document_type TEXT NOT NULL UNIQUE,
    last_value INTEGER NOT NULL DEFAULT 0,
    updated_at ${db.driver === 'postgres' ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP
  )`).catch(() => {});
}

export function formatDocumentNumber(prefix, value) {
  const cleanPrefix = String(prefix || '').toUpperCase();
  return `${cleanPrefix}-${String(Number(value) || 0).padStart(WIDTH, '0')}`;
}

/**
 * Next number for a document type.
 * @param {object} options
 * @param {string} options.type   counter to draw from, e.g. 'retail_sale'.
 * @param {string} options.prefix printed prefix, e.g. 'INV'.
 * @param {number} [options.seed] start the counter above this value.
 */
export async function nextDocumentNumber(db, { type, prefix, seed = 0 }) {
  if (!type || !prefix) throw new Error('Document number type and prefix are required.');
  await ensureDocumentNumberSchema(db);

  const cleanType = String(type).toLowerCase();
  const seedValue = Math.max(0, Number(seed) || 0);

  if (db.driver === 'postgres') {
    await db.run(
      `INSERT INTO document_counters (document_type, last_value)
       VALUES (?, ?)
       ON CONFLICT (document_type) DO NOTHING`,
      [cleanType, seedValue]
    );
    const row = await db.get(
      `SELECT last_value FROM document_counters WHERE document_type = ? FOR UPDATE`,
      [cleanType]
    );
    const next = Math.max(Number(row?.last_value || 0), seedValue) + 1;
    await db.run(
      `UPDATE document_counters
       SET last_value = ?, updated_at = CURRENT_TIMESTAMP
       WHERE document_type = ?`,
      [next, cleanType]
    );
    return formatDocumentNumber(prefix, next);
  }

  await db.run(
    `INSERT OR IGNORE INTO document_counters (document_type, last_value)
     VALUES (?, ?)`,
    [cleanType, seedValue]
  );
  const row = await db.get(
    `SELECT last_value FROM document_counters WHERE document_type = ?`,
    [cleanType]
  );
  const next = Math.max(Number(row?.last_value || 0), seedValue) + 1;
  await db.run(
    `UPDATE document_counters
     SET last_value = ?, updated_at = CURRENT_TIMESTAMP
     WHERE document_type = ?`,
    [next, cleanType]
  );
  return formatDocumentNumber(prefix, next);
}
