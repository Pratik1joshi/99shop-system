/**
 * Store credit: a real customer liability ledger (account 2030), not a bare
 * `customers.store_credit = 5000` number. store_credit_transactions is the
 * authoritative audit trail; customers.store_credit_balance is a cache that
 * exists ONLY so a redemption can lock one row (SELECT ... FOR UPDATE) and be
 * atomic against a concurrent issue/redeem for the same customer — every
 * write updates both, in the same transaction, never one without the other.
 *
 * Store credit is never revenue, cash, or AR — it is money the business owes
 * the customer. Issuing it credits 2030; redeeming it debits 2030.
 */

import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import { ensureColumn } from '@/lib/db/schema-helpers.js';
import { postJournal, accountBalance } from '@/lib/accounting.js';
import { currentBusinessDayId } from '@/lib/business-days.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const needsOwnTransaction = (db) => typeof db.transaction === 'function'
  && !(db.driver === 'sqlite' && (db.db?.inTransaction || db.db?.isTransaction));

export async function ensureStoreCreditSchema(db) {
  await ensureColumn(db, 'customers', 'store_credit_balance', 'NUMERIC(14,2) NOT NULL DEFAULT 0');
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS store_credit_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    balance_after NUMERIC(14,2) NOT NULL,
    source_type TEXT,
    source_id INTEGER,
    reason TEXT,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await ensureColumn(db, 'store_credit_transactions', 'idempotency_key', 'TEXT');
  await ensureSqliteTable(db, `CREATE UNIQUE INDEX IF NOT EXISTS uq_store_credit_adjustment_key
    ON store_credit_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL`);
}

async function lockCustomer(db, customerId) {
  const lock = db.driver === 'postgres' ? ' FOR UPDATE' : '';
  const row = await db.get(`SELECT id, store_credit_balance FROM customers WHERE id = ?${lock}`, [customerId]);
  if (!row) throw bad('Customer not found.', 404);
  return row;
}

async function writeTransaction(db, { customerId, type, amount, newBalance, sourceType, sourceId, reason, createdBy, idempotencyKey = null }) {
  await db.run(`UPDATE customers SET store_credit_balance = ? WHERE id = ?`, [newBalance, customerId]);
  const inserted = await db.run(
    `INSERT INTO store_credit_transactions (customer_id, type, amount, balance_after, source_type, source_id, reason, created_by, idempotency_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [customerId, type, amount, newBalance, sourceType || null, sourceId || null, reason || null, createdBy || null, idempotencyKey]
  );
  return inserted.lastInsertRowid;
}

/**
 * @param {boolean} [opts.skipJournal] the caller (e.g. postReturn) is already
 *   posting a compound journal that includes the 2030 leg — set true to avoid
 *   double-posting. Standalone issuance debits 5070 (Discounts & Write-offs —
 *   the existing account for "the business gave money away").
 */
export async function issueStoreCredit(db, opts) {
  if (needsOwnTransaction(db)) {
    return db.transaction((tx) => issueStoreCredit(tx, opts));
  }
  const { customerId, amount, sourceType = null, sourceId = null, reason = null, createdBy = null, skipJournal = false, businessDayId = null } = opts;
  const amt = round2(amount);
  if (!(amt > 0)) throw bad('Store credit amount must be greater than zero.');
  await ensureStoreCreditSchema(db);

  const customer = await lockCustomer(db, customerId);
  const newBalance = round2(Number(customer.store_credit_balance) + amt);
  await writeTransaction(db, { customerId, type: 'ISSUE', amount: amt, newBalance, sourceType, sourceId, reason, createdBy });

  if (!skipJournal) {
    const day = businessDayId || await currentBusinessDayId(db, { required: true });
    await postJournal(db, {
      memo: reason || 'Store credit issued',
      source_type: sourceType || 'store_credit_issue',
      source_id: sourceId,
      created_by: createdBy,
      business_day_id: day,
      lines: [
        { code: '5070', debit: amt, credit: 0, memo: 'Store credit issued (goodwill)' },
        { code: '2030', debit: 0, credit: amt, customer_id: customerId, memo: 'Store credit liability' },
      ],
    });
  }
  return { customerId, balance: newBalance, amount: amt };
}

/**
 * Ledger + balance only — never posts its own journal. Redeeming store
 * credit is always one leg of a larger compound transaction whose OTHER leg
 * (what the credit paid for — a sale's Cr 4010, a return's netting, etc.) the
 * caller already knows; a standalone redemption journal would have no
 * legitimate destination for the debit side to land on.
 */
export async function redeemStoreCredit(db, opts) {
  if (needsOwnTransaction(db)) {
    return db.transaction((tx) => redeemStoreCredit(tx, opts));
  }
  const { customerId, amount, sourceType = null, sourceId = null, reason = null, createdBy = null } = opts;
  const amt = round2(amount);
  if (!(amt > 0)) throw bad('Redemption amount must be greater than zero.');
  await ensureStoreCreditSchema(db);

  const customer = await lockCustomer(db, customerId);
  const available = round2(Number(customer.store_credit_balance));
  if (amt > available + 0.005) throw bad(`Only ${available} store credit available.`, 409);
  const newBalance = round2(available - amt);
  await writeTransaction(db, { customerId, type: 'REDEEM', amount: -amt, newBalance, sourceType, sourceId, reason, createdBy });
  return { customerId, balance: newBalance, amount: amt };
}

/** Manual correction — always posts its own journal (this is never embedded in a larger transaction). */
export async function adjustStoreCredit(db, { customerId, amount, reason, createdBy = null, businessDayId = null, idempotencyKey = null }) {
  const amt = round2(amount); // signed: positive increases, negative decreases
  if (amt === 0) throw bad('Adjustment amount cannot be zero.');
  if (!String(reason || '').trim()) throw bad('A reason is required for a store credit adjustment.');
  await ensureStoreCreditSchema(db);

  return db.transaction(async (tx) => {
    const customer = await lockCustomer(tx, customerId);
    const key = String(idempotencyKey || '').trim() || null;
    if (key) {
      const previous = await tx.get(`SELECT id,customer_id,amount,balance_after,reason FROM store_credit_transactions WHERE idempotency_key=?`, [key]);
      if (previous) {
        if (Number(previous.customer_id) !== Number(customerId) || round2(previous.amount) !== amt || String(previous.reason) !== String(reason)) {
          throw bad('This adjustment key was already used for different details.', 409);
        }
        return { customerId, balance: round2(previous.balance_after), amount: amt, transactionId: previous.id };
      }
    }
    const newBalance = round2(Number(customer.store_credit_balance) + amt);
    if (newBalance < -0.005) throw bad('Adjustment would make store credit negative.', 409);
    const transactionId = await writeTransaction(tx, { customerId, type: 'ADJUSTMENT', amount: amt, newBalance, sourceType: 'manual_adjustment', reason, createdBy, idempotencyKey: key });

    const day = businessDayId || await currentBusinessDayId(tx, { required: true });
    const increasing = amt > 0;
    await postJournal(tx, {
      memo: `Store credit adjustment — ${reason}`,
      source_type: 'store_credit_adjustment',
      source_id: transactionId,
      created_by: createdBy,
      business_day_id: day,
      lines: increasing
        ? [
            { code: '5070', debit: Math.abs(amt), credit: 0, memo: 'Store credit adjustment' },
            { code: '2030', debit: 0, credit: Math.abs(amt), customer_id: customerId, memo: 'Store credit increased' },
          ]
        : [
            { code: '2030', debit: Math.abs(amt), credit: 0, customer_id: customerId, memo: 'Store credit decreased' },
            { code: '5070', debit: 0, credit: Math.abs(amt), memo: 'Store credit adjustment reversed' },
          ],
    });
    return { customerId, balance: newBalance, amount: amt, transactionId };
  });
}

export async function getStoreCreditBalance(db, customerId) {
  await ensureStoreCreditSchema(db);
  const row = await db.get(`SELECT store_credit_balance FROM customers WHERE id = ?`, [customerId]);
  return round2(row?.store_credit_balance);
}

export async function listStoreCreditTransactions(db, customerId, { limit = 100 } = {}) {
  await ensureStoreCreditSchema(db);
  return db.all(
    `SELECT * FROM store_credit_transactions WHERE customer_id = ? ORDER BY id DESC LIMIT ?`,
    [customerId, Math.min(500, Math.max(1, Number(limit) || 100))]
  );
}

/** Σ(customers.store_credit_balance) vs the 2030 GL balance — must match. */
export async function reconcileStoreCreditLiability(db) {
  await ensureStoreCreditSchema(db);
  const row = await db.get(`SELECT COALESCE(SUM(store_credit_balance), 0) AS total FROM customers`);
  const ledgerTotal = round2(row?.total);
  const glBalance = round2(-(await accountBalance(db, '2030'))); // liability: credit-normal
  const difference = round2(ledgerTotal - glBalance);
  return { ledgerTotal, glBalance, difference, reconciled: Math.abs(difference) < 0.01 };
}
