import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';

export const CUSTOMER_MASTER_FIELDS = Object.freeze(['name','phone','email','address','notes','credit_limit','is_vip','is_blacklisted','loyalty_tier_override']);
export async function ensureCustomerMasterAudit(db) {
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS customer_master_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL, action TEXT NOT NULL,
    actor_id INTEGER, before_json TEXT, after_json TEXT, reason TEXT,
    created_at DATETIME NOT NULL DEFAULT (datetime('now','+5 hours','+45 minutes')))`);
}

/** Called within the same transaction as the master update. Never audits balances. */
export async function recordCustomerMasterChange(tx, { before = null, after = null, actorId, reason = null }) {
  const changed = CUSTOMER_MASTER_FIELDS.filter((key) => (before?.[key] ?? null) !== (after?.[key] ?? null));
  if (before && after && !changed.length) return null;
  const project = (row) => row ? Object.fromEntries(changed.map((key) => [key,row[key] ?? null])) : null;
  const result = await tx.run(`INSERT INTO customer_master_audit(customer_id,action,actor_id,before_json,after_json,reason)
    VALUES (?,?,?,?,?,?)`, [(after || before).id, !before ? 'CREATED' : !after ? 'DELETED' : 'UPDATED', actorId,
    JSON.stringify(project(before)), JSON.stringify(project(after)), String(reason || '').trim().slice(0,1000) || null]);
  return result.lastInsertRowid;
}
