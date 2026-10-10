/**
 * Supplier accounting — all derived from the Accounts Payable account (2010)
 * with the supplier sub-ledger tag on each line. No separate balances table:
 *
 *   - a credit purchase posts Cr AP (2010) tagged supplier_id
 *   - a supplier payment posts Dr AP (2010, supplier) / Cr cash|bank
 *
 * Outstanding = Σ(credit - debit) on 2010 per supplier. Ageing applies payments
 * FIFO against the oldest open invoices.
 */

import { postJournal, accountIdByCode, accountBalance, paymentAccountCode, currentDrawerId, primaryBankAccountId } from './accounting.js';
import { currentBusinessDayId } from './business-days.js';
import { ensureSqliteTable } from './db/ensure-sqlite-table.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const bad = (m) => Object.assign(new Error(m), { status: 400 });

async function ensureSupplierPaymentAllocations(db) {
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    payment_journal_id INTEGER NOT NULL,
    charge_journal_id INTEGER NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (payment_journal_id, charge_journal_id)
  )`);
}

/** AP account id, memoised per call chain by the caller passing db. */
async function apId(db) {
  return accountIdByCode(db, '2010');
}

/** Per-supplier outstanding payable (only those with a non-zero balance). */
export async function supplierPayables(db) {
  const ap = await apId(db);
  const rows = await db.all(
    `SELECT s.id, s.name, s.phone,
       COALESCE(SUM(jl.credit - jl.debit), 0) AS outstanding
     FROM suppliers s
     JOIN journal_lines jl ON jl.supplier_id = s.id AND jl.account_id = ?
     GROUP BY s.id, s.name, s.phone
     HAVING COALESCE(SUM(jl.credit - jl.debit), 0) > 0.009
     ORDER BY outstanding DESC`,
    [ap]
  );
  return rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, outstanding: round2(r.outstanding) }));
}

/** Statement of one supplier's AP movements (oldest first). */
export async function supplierStatement(db, supplierId, { from = null, to = null } = {}) {
  const ap = await apId(db);
  const params = [ap, supplierId];
  let where = '';
  if (from) { where += ' AND je.entry_date >= ?'; params.push(from); }
  if (to) { where += ' AND je.entry_date <= ?'; params.push(to); }
  return db.all(
    `SELECT je.id AS journal_id, je.entry_date, je.created_at, je.memo, je.source_type,
            original.source_type AS reversed_source_type, jl.debit, jl.credit
     FROM journal_lines jl JOIN journal_entries je ON jl.journal_id = je.id
     LEFT JOIN journal_entries original ON je.source_type='reversal' AND original.id=je.source_id
     WHERE jl.account_id = ? AND jl.supplier_id = ?${where}
     ORDER BY je.entry_date, je.id, jl.id`,
    params
  );
}

/** Flat, all-supplier AP history for the Supplier Ledger history tab. */
export async function supplierLedgerHistory(db, { from = null, to = null, status = 'all', search = null, limit = 200 } = {}) {
  const ap = await apId(db);
  const params = [ap];
  let where = '1=1';
  if (from) { where += ' AND je.entry_date >= ?'; params.push(from); }
  if (to) { where += ' AND je.entry_date <= ?'; params.push(to); }
  if (status === 'charged') where += " AND jl.credit > 0 AND je.source_type <> 'reversal'";
  else if (status === 'paid') where += " AND jl.debit > 0 AND je.source_type <> 'reversal'";
  else if (status === 'reversed') where += " AND je.source_type = 'reversal'";
  if (search) { where += ' AND s.name LIKE ?'; params.push(`%${search}%`); }
  params.push(Math.min(500, Math.max(1, Number(limit) || 200)));

  const rows = await db.all(
    `SELECT jl.id, je.id AS journal_id, je.entry_date AS date, je.memo, je.source_type,
            jl.debit, jl.credit, s.id AS supplier_id, s.name AS supplier_name, s.phone AS supplier_phone
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_id
     JOIN suppliers s ON s.id = jl.supplier_id
     WHERE jl.account_id = ? AND ${where}
     ORDER BY je.entry_date DESC, je.id DESC, jl.id DESC
     LIMIT ?`,
    params
  );

  return (rows || []).map((row) => ({
    ...row,
    debit: round2(row.debit),
    credit: round2(row.credit),
    status: row.source_type === 'reversal' ? 'reversed' : Number(row.credit) > 0 ? 'charged' : 'paid',
  }));
}

/** All liability accounts with their current balance (credit - debit). */
export async function liabilityLedger(db) {
  return db.all(
    `SELECT a.code, a.name, a.subtype,
       COALESCE(SUM(jl.credit - jl.debit), 0) AS balance
     FROM accounts a
     LEFT JOIN journal_lines jl ON jl.account_id = a.id
     WHERE a.type = 'liability' AND a.parent_id IS NOT NULL
     GROUP BY a.id ORDER BY a.code`
  );
}

const DAY = 24 * 60 * 60 * 1000;
function bucketOf(days) {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

/**
 * FIFO ageing. For each supplier, credits are invoices and debits are payments
 * applied to the oldest open invoice first; whatever is still open is bucketed
 * by the invoice's age.
 */
export async function liabilityAgeing(db) {
  await ensureSupplierPaymentAllocations(db);
  const ap = await apId(db);
  const rows = await db.all(
    `SELECT s.id AS supplier_id, s.name, je.id AS journal_id, je.entry_date, jl.debit, jl.credit
     FROM journal_lines jl
     JOIN journal_entries je ON jl.journal_id = je.id
     JOIN suppliers s ON jl.supplier_id = s.id
     WHERE jl.account_id = ?
     ORDER BY s.id, je.entry_date, je.id, jl.id`,
    [ap]
  );
  const allocations = await db.all(`SELECT payment_journal_id,charge_journal_id,SUM(amount) AS amount
    FROM supplier_payment_allocations GROUP BY payment_journal_id,charge_journal_id`);
  const allocatedByPayment = new Map();
  const allocatedByCharge = new Map();
  for (const allocation of allocations) {
    allocatedByPayment.set(Number(allocation.payment_journal_id), round2((allocatedByPayment.get(Number(allocation.payment_journal_id)) || 0) + Number(allocation.amount)));
    allocatedByCharge.set(Number(allocation.charge_journal_id), round2((allocatedByCharge.get(Number(allocation.charge_journal_id)) || 0) + Number(allocation.amount)));
  }

  const now = Date.now();
  const bySupplier = new Map();
  for (const r of rows) {
    if (!bySupplier.has(r.supplier_id)) bySupplier.set(r.supplier_id, { name: r.name, invoices: [], payment: 0 });
    const s = bySupplier.get(r.supplier_id);
    const credit = round2(r.credit);
    const debit = round2(r.debit);
    if (credit > 0) s.invoices.push({ date: r.entry_date, open: Math.max(0, round2(credit - (allocatedByCharge.get(Number(r.journal_id)) || 0))) });
    if (debit > 0) s.payment += Math.max(0, round2(debit - (allocatedByPayment.get(Number(r.journal_id)) || 0)));
  }

  const result = [];
  for (const [supplier_id, s] of bySupplier) {
    // Apply all payments FIFO to the oldest invoices.
    let pay = s.payment;
    for (const inv of s.invoices) {
      if (pay <= 0) break;
      const applied = Math.min(pay, inv.open);
      inv.open = round2(inv.open - applied);
      pay = round2(pay - applied);
    }
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    let total = 0;
    for (const inv of s.invoices) {
      if (inv.open <= 0.001) continue;
      const age = Math.max(0, Math.floor((now - new Date(`${String(inv.date).slice(0, 10)}T00:00:00`).getTime()) / DAY));
      buckets[bucketOf(age)] = round2(buckets[bucketOf(age)] + inv.open);
      total = round2(total + inv.open);
    }
    if (total > 0.001) result.push({ supplier_id, name: s.name, ...buckets, total });
  }
  return result.sort((a, b) => b.total - a.total);
}

/**
 * Open (not yet fully paid) supplier invoices — same FIFO payment allocation
 * as liabilityAgeing, but scoped to a single supplier and resolved back to the
 * goods receipt for display. View-only: a supplier
 * payment settles the oldest invoice(s) automatically, it isn't picked here.
 */
export async function supplierOpenInvoices(db, supplierId) {
  await ensureSupplierPaymentAllocations(db);
  const ap = await apId(db);
  const rows = await db.all(
    `SELECT je.id AS journal_id,je.entry_date, je.source_type, je.source_id, je.memo, jl.debit, jl.credit
     FROM journal_lines jl
     JOIN journal_entries je ON jl.journal_id = je.id
     WHERE jl.account_id = ? AND jl.supplier_id = ?
     ORDER BY je.entry_date, je.id`,
    [ap, supplierId]
  );
  const allocations = await db.all(`SELECT payment_journal_id,charge_journal_id,SUM(amount) AS amount
    FROM supplier_payment_allocations WHERE supplier_id=? GROUP BY payment_journal_id,charge_journal_id`, [supplierId]);
  const allocatedByPayment = new Map();
  const allocatedByCharge = new Map();
  for (const allocation of allocations) {
    allocatedByPayment.set(Number(allocation.payment_journal_id), round2((allocatedByPayment.get(Number(allocation.payment_journal_id)) || 0) + Number(allocation.amount)));
    allocatedByCharge.set(Number(allocation.charge_journal_id), round2((allocatedByCharge.get(Number(allocation.charge_journal_id)) || 0) + Number(allocation.amount)));
  }

  const invoices = [];
  let payment = 0;
  for (const r of rows) {
    const credit = round2(r.credit);
    const debit = round2(r.debit);
    if (credit > 0) invoices.push({
      journal_id: r.journal_id,
      source_type: r.source_type,
      source_id: r.source_id,
      description: r.memo || null,
      date: r.entry_date,
      open: Math.max(0, round2(credit - (allocatedByCharge.get(Number(r.journal_id)) || 0))),
      total: credit,
    });
    if (debit > 0) payment = round2(payment + Math.max(0, debit - (allocatedByPayment.get(Number(r.journal_id)) || 0)));
  }
  let pay = payment;
  for (const inv of invoices) {
    if (pay <= 0) break;
    const applied = Math.min(pay, inv.open);
    inv.open = round2(inv.open - applied);
    pay = round2(pay - applied);
  }

  const open = invoices.filter((inv) => inv.open > 0.009);
  if (!open.length) return [];

  const receiptIds = open.filter((inv) => inv.source_type === 'goods_receipt').map((inv) => inv.source_id).filter(Boolean);
  const receipts = receiptIds.length ? await db.all(
    `SELECT id,grn_number,invoice_number FROM goods_receipts WHERE id IN (${receiptIds.map(() => '?').join(',')})`, receiptIds
  ).catch(() => []) : [];
  const receiptById = new Map(receipts.map((r) => [Number(r.id), r]));

  return open
    .map((inv) => {
      const receipt = inv.source_type === 'goods_receipt' ? receiptById.get(Number(inv.source_id)) : null;
      return {
        goods_receipt_id: receipt?.id || null,
        journal_id: inv.journal_id,
        source_type: inv.source_type,
        source_id: inv.source_id,
        invoice_number: receipt?.invoice_number || receipt?.grn_number || null,
        description: inv.description || (inv.source_type === 'reversal' ? 'Reversed supplier payment' : null),
        date: inv.date,
        total: inv.total,
        outstanding: inv.open,
      };
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

/** Pay a supplier: Dr Accounts Payable (supplier) / Cr cash|bank. */
export async function paySupplier(db, { supplier_id, amount, method = 'cash', bank_account_id = null, note, external_ref = null, created_by = null, allow_over = false, allocations = null }) {
  const amt = round2(amount);
  if (!supplier_id) throw bad('Which supplier is this payment for?');
  if (!(amt > 0)) throw bad('Amount must be greater than zero.');
  if (external_ref) {
    const existing = await db.get(`SELECT id,source_type FROM journal_entries WHERE external_ref=?`, [external_ref]);
    if (existing) {
      if (existing.source_type !== 'supplier_payment') throw bad('Payment reference was used for another journal.');
      return existing.id;
    }
  }
  if (allocations != null) {
    if (!Array.isArray(allocations) || !allocations.length) throw bad('Select at least one invoice allocation.');
    const ids = allocations.map((row) => Number(row.journal_id));
    if (ids.some((id) => !Number.isInteger(id) || id < 1) || new Set(ids).size !== ids.length) throw bad('Invoice allocations must be distinct valid charges.');
    if (Math.abs(allocations.reduce((sum, row) => sum + Number(row.amount || 0), 0) - amt) > 0.005 ||
        allocations.some((row) => !(Number(row.amount) > 0))) throw bad('Allocated amount must equal the payment amount.');
  }
  const m = String(method).toLowerCase();
  const creditCode = m === 'cash' ? '1010' : ['bank', 'bank_transfer', 'cheque'].includes(m) ? '1020' : paymentAccountCode(m);

  if (!allow_over) {
    // accountBalance returns debit-credit; AP is credit-normal, so owed = -(debit-credit).
    const owed = round2(-(await accountBalance(db, '2010', { supplierId: supplier_id })));
    if (amt > owed + 0.001) throw bad(`This supplier is only owed ${owed}.`);
  }

  const drawerId = creditCode === '1010' ? await currentDrawerId(db) : null;
  const resolvedBankId = creditCode === '1020' ? (bank_account_id || await primaryBankAccountId(db)) : null;
  const businessDayId = await currentBusinessDayId(db, { required: true });
  return db.transaction(async (tx) => {
    if (allocations != null) {
      await ensureSupplierPaymentAllocations(tx);
      const invoices = await supplierOpenInvoices(tx, supplier_id);
      const byJournal = new Map(invoices.map((invoice) => [Number(invoice.journal_id), Number(invoice.outstanding)]));
      for (const row of allocations) {
        if (Number(row.amount) > (byJournal.get(Number(row.journal_id)) || 0) + 0.005) throw bad('An invoice allocation exceeds its current outstanding amount.');
      }
    }
    const journalId = await postJournal(tx, {
      memo: note || 'Supplier payment',
      source_type: 'supplier_payment',
      source_id: null,
      external_ref,
      created_by,
      business_day_id: businessDayId,
      lines: [
        { code: '2010', debit: amt, credit: 0, supplier_id, memo: 'AP settled' },
        { code: creditCode, debit: 0, credit: amt, drawer_id: drawerId, bank_account_id: resolvedBankId },
      ],
    });
    if (allocations != null) {
      for (const row of allocations) await tx.run(`INSERT INTO supplier_payment_allocations
        (supplier_id,payment_journal_id,charge_journal_id,amount) VALUES (?,?,?,?)`,
      [supplier_id, journalId, row.journal_id, round2(row.amount)]);
    }
    return journalId;
  });
}
