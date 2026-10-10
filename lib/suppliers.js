/**
 * Supplier master: the table every goods receipt, purchase order and return
 * points at, plus find-or-create and the paged list the Purchases screens use.
 */

import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import { buildSearch, paginateQuery, resolveOrderBy } from '@/lib/paginate.js';

/** Case- and whitespace-insensitive key used by every unique/dedupe check. */
export function normalizeName(name = '') {
  return String(name).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Postgres gets this from migrations; SQLite (dev fallback) creates it here. */
export async function ensureSupplierSchema(db) {
  await ensureSqliteTable(
    db,
    `CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      phone TEXT, email TEXT, address TEXT, notes TEXT,
      is_archived INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );
}

/** Find-or-create a supplier by normalized name. Returns the row, or null for blank input. */
export async function resolveSupplier(db, name, extra = {}) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  const key = normalizeName(clean);

  const existing = await db.get(`SELECT * FROM suppliers WHERE normalized_name = ?`, [key]);
  if (existing) return existing;

  await db.run(
    `INSERT INTO suppliers (name, normalized_name, phone, email, address, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [clean, key, extra.phone || null, extra.email || null, extra.address || null, extra.notes || null]
  );
  return db.get(`SELECT * FROM suppliers WHERE normalized_name = ?`, [key]);
}

const SUPPLIER_SORTS = {
  name: 's.name',
  phone: 's.phone',
  email: 's.email',
  created_at: 's.created_at',
};

const SUPPLIER_SEARCH_COLUMNS = ['s.name', 's.phone', 's.email', 's.address', 's.notes'];

/** Suppliers with their posted goods-receipt count, spend and last receipt. @returns {{ rows: any[], pagination: object }} */
export async function listSuppliers(
  db,
  { includeArchived = false, page = 1, pageSize = 50, exportAll = false, sort = '', dir = 'ASC', search = '' } = {}
) {
  const conditions = [includeArchived ? '1=1' : 'COALESCE(s.is_archived, 0) = 0'];
  const params = [];

  const searchClause = buildSearch(search, SUPPLIER_SEARCH_COLUMNS);
  if (searchClause.clause) {
    conditions.push(searchClause.clause);
    params.push(...searchClause.params);
  }

  return paginateQuery(db, {
    columns: `s.*,
      (SELECT COUNT(*) FROM goods_receipts g WHERE g.supplier_id = s.id AND g.status = 'POSTED') AS purchase_count,
      (SELECT COALESCE(SUM(l.net_amount), 0) FROM goods_receipt_lines l
        JOIN goods_receipts g ON g.id = l.goods_receipt_id
        WHERE g.supplier_id = s.id AND g.status = 'POSTED') AS total_spend,
      (SELECT MAX(g.posted_at) FROM goods_receipts g WHERE g.supplier_id = s.id AND g.status = 'POSTED') AS last_purchase_at`,
    from: 'suppliers s',
    where: conditions.join(' AND '),
    params,
    orderBy: resolveOrderBy(sort, dir, SUPPLIER_SORTS, 'name', 's.id'),
    page,
    pageSize,
    exportAll,
  });
}
