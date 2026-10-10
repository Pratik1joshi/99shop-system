/**
 * Expense lifecycle beyond the plain create: business-day alignment, closed-day
 * corrections, payment-method corrections and voids, each as audited journals.
 */

import {
  accountBalance,
  currentDrawerId,
  ensureAccountingSchema,
  paymentAccountCode,
  postJournal,
  primaryBankAccountId,
} from '@/lib/accounting.js';
import { reverseJournal } from '@/lib/accounting-corrections.js';
import { businessDayIdForCalendarDate, currentBusinessDayId } from '@/lib/business-days.js';
import { nepalDateString } from '@/lib/report-dates.js';
import { ensureColumn } from '@/lib/db/schema-helpers.js';
import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import { normalizePaymentMethod } from '@/lib/payment-allocations.js';

export async function ensureExpenseVoidSchema(db) {
  await ensureColumn(db, 'expenses', 'purchase_date', 'TEXT');
  await ensureColumn(db, 'expenses', 'payment_method', "TEXT DEFAULT 'cash'");
  await ensureColumn(db, 'expenses', 'logged_by', 'INTEGER');
  await ensureColumn(db, 'expenses', 'receipt_url', 'TEXT');
  await ensureColumn(db, 'expenses', 'source_type', 'TEXT');
  await ensureColumn(db, 'expenses', 'source_id', 'INTEGER');
  await ensureColumn(db, 'expenses', 'business_day_id', 'INTEGER');
  await ensureColumn(db, 'expenses', 'status', "TEXT DEFAULT 'active'");
  await ensureColumn(db, 'expenses', 'void_reason', 'TEXT');
  await ensureColumn(db, 'expenses', 'voided_at', 'DATETIME');
  await ensureColumn(db, 'expenses', 'voided_by', 'INTEGER');
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS expense_change_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    reason TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    request_key TEXT UNIQUE,
    performed_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

/**
 * Manual expenses used to always tag the *open* business day even when the
 * expense date was yesterday. Money Out (by date) then disagreed with Cash
 * Position (by business_day_id). Re-attach row + expense journal to the day
 * matching COALESCE(purchase_date, expense_date).
 */
export async function repairExpenseBusinessDayAlignment(db) {
  await ensureExpenseVoidSchema(db);
  const rows = await db.all(
    `SELECT e.id, e.business_day_id,
            COALESCE(e.purchase_date, CAST(e.expense_date AS TEXT)) AS expense_on,
            bd.business_date
     FROM expenses e
     LEFT JOIN business_days bd ON bd.id = e.business_day_id
     WHERE LOWER(COALESCE(e.status,'active')) <> 'voided'`
  ).catch(() => []);

  let fixed = 0;
  for (const row of rows || []) {
    const date = String(row.expense_on || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const taggedDate = row.business_date ? String(row.business_date).slice(0, 10) : null;
    if (taggedDate === date) continue;
    const dayId = await businessDayIdForCalendarDate(db, date, {
      note: 'Historical day created while repairing expense date alignment.',
    });
    if (!dayId || Number(dayId) === Number(row.business_day_id || 0)) continue;
    await db.run(`UPDATE expenses SET business_day_id=? WHERE id=?`, [dayId, row.id]);
    await db.run(
      `UPDATE journal_entries SET business_day_id=?
        WHERE source_type='expense' AND source_id=?`,
      [dayId, row.id]
    );
    fixed += 1;
  }
  return fixed;
}

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// PostgreSQL returns DATE columns as Date objects while SQLite returns text.
// String(date).slice(0, 10) produces values such as "Mon Sep 14", which a
// PostgreSQL DATE insert rejects. Preserve the calendar date in either driver.
function databaseDateKey(value) {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return String(value ?? '').slice(0, 10);
}

function expensePaymentAccount(expense, method) {
  if (method === 'owner_pocket') return '3010';
  if (method === 'business_funding') return '1050';
  return paymentAccountCode(method);
}

/** Correct a manual closed-day expense without rewriting its original journal. */
export async function correctClosedManualExpense(db, {
  expenseId, changes = {}, reason, performedBy = null, requestKey = null, useBusinessFunding = false,
} = {}) {
  const id = Number(expenseId);
  if (!Number.isInteger(id) || id <= 0) throw Object.assign(new Error('Choose a valid expense.'), { status: 400 });
  const cleanReason = String(reason || '').trim();
  if (cleanReason.length < 3) throw Object.assign(new Error('Enter a clear reason for this correction.'), { status: 400 });
  await ensureExpenseVoidSchema(db);
  await ensureAccountingSchema(db);
  return db.transaction(async (tx) => {
    if (requestKey) {
      const duplicate = await tx.get('SELECT id FROM expense_change_audit WHERE request_key=?', [requestKey]);
      if (duplicate) return tx.get('SELECT * FROM expenses WHERE id=?', [id]);
    }
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    const current = await tx.get(`SELECT e.*,bd.status AS business_day_status,bd.business_date FROM expenses e LEFT JOIN business_days bd ON bd.id=e.business_day_id WHERE e.id=?${lock}`, [id]);
    if (!current) throw Object.assign(new Error('Expense not found.'), { status: 404 });
    if (current.source_type) throw Object.assign(new Error('Correct this expense from the record that generated it.'), { status: 409 });
    if (String(current.status || 'active').toLowerCase() === 'voided') throw Object.assign(new Error('A voided expense cannot be corrected.'), { status: 409 });
    if (current.business_day_status !== 'closed') throw Object.assign(new Error('Use normal editing while the business day is open.'), { status: 409 });
    const currentDate = databaseDateKey(current.purchase_date || current.expense_date);
    const nextDate = databaseDateKey(changes.purchase_date || changes.expense_date || currentDate);
    if (nextDate !== currentDate) throw Object.assign(new Error('A closed expense cannot be moved to another date. Void and re-enter it through a dedicated correction workflow.'), { status: 409 });
    const previousMethod = normalizePaymentMethod(current.payment_method || 'cash');
    const nextMethod = normalizePaymentMethod(changes.payment_method || previousMethod);
    if (nextMethod !== previousMethod) throw Object.assign(new Error('Use Correct payment to change the payment method.'), { status: 409 });
    const nextAmount = round2(changes.amount);
    if (!(nextAmount > 0)) throw Object.assign(new Error('Amount must be greater than zero.'), { status: 400 });
    const difference = round2(nextAmount - Number(current.amount || 0));
    const paymentCode = expensePaymentAccount(current, previousMethod);
    const originalTag = await tx.get(`SELECT jl.drawer_id,jl.bank_account_id FROM journal_entries je JOIN journal_lines jl ON jl.journal_id=je.id JOIN accounts a ON a.id=jl.account_id WHERE je.source_type='expense' AND je.source_id=? AND a.code=? ORDER BY jl.id LIMIT 1`, [id, paymentCode]).catch(() => null);
    const drawerRow = current.business_day_id && paymentCode === '1010' ? await tx.get('SELECT drawer_id FROM drawer_sessions WHERE business_day_id=? ORDER BY opened_at,id LIMIT 1', [current.business_day_id]).catch(() => null) : null;
    const drawerId = paymentCode === '1010' ? (originalTag?.drawer_id || drawerRow?.drawer_id || null) : null;
    const bankAccountId = paymentCode === '1020' ? (originalTag?.bank_account_id || await primaryBankAccountId(tx)) : null;
    if (Math.abs(difference) > 0.001) {
      let lines;
      if (difference > 0) {
        const { prepareExpenseFunding, BUSINESS_FUNDING_CODE } = await import('@/lib/business-funding.js');
        if (paymentCode === BUSINESS_FUNDING_CODE) {
          const available = round2(await accountBalance(tx, BUSINESS_FUNDING_CODE));
          if (available + 0.001 < difference) throw Object.assign(new Error(`Business Funding has Rs ${available.toFixed(2)} available, but this correction needs Rs ${difference.toFixed(2)}.`), { status: 409, code: 'business_funding_insufficient', available, shortfall: round2(difference - available) });
        }
        const funding = await prepareExpenseFunding(tx, { id, amount: difference, expense_date: currentDate, business_day_id: current.business_day_id, use_business_funding: Boolean(useBusinessFunding) }, paymentCode);
        const shortfall = round2(funding.amount || 0);
        lines = [{ code: '5020', debit: difference, credit: 0, memo: 'Increase corrected expense' }];
        if (difference - shortfall > 0.001) lines.push({ code: paymentCode, debit: 0, credit: round2(difference - shortfall), drawer_id: drawerId, bank_account_id: bankAccountId, memo: `Increase ${previousMethod}` });
        if (shortfall > 0.001) lines.push({ code: BUSINESS_FUNDING_CODE, debit: 0, credit: shortfall, memo: 'Business Funding correction shortfall' });
      } else {
        const reduction = Math.abs(difference);
        const paid = await tx.all(`SELECT a.code,COALESCE(SUM(jl.credit-jl.debit),0) AS amount FROM journal_entries je JOIN journal_lines jl ON jl.journal_id=je.id JOIN accounts a ON a.id=jl.account_id WHERE ((je.source_type='expense' AND je.source_id=?) OR (je.source_type IN ('expense_edit_correction','expense_payment_method_correction') AND je.external_ref LIKE ?)) AND a.code IN ('1010','1020','1050','3010','1090') GROUP BY a.code`, [id, `%:${id}:%`]);
        const available = new Map((paid || []).map((row) => [row.code, Math.max(0, round2(row.amount))]));
        const order = [paymentCode, '1050', '1010', '1020', '3010', '1090'].filter((code, index, all) => all.indexOf(code) === index);
        let remaining = reduction;
        lines = [];
        for (const code of order) {
          const amount = Math.min(remaining, available.get(code) || 0);
          if (amount > 0.001) { lines.push({ code, debit: amount, credit: 0, drawer_id: code === '1010' ? drawerId : null, bank_account_id: code === '1020' ? bankAccountId : null, memo: 'Return corrected expense payment' }); remaining = round2(remaining - amount); }
        }
        if (remaining > 0.001) lines.push({ code: paymentCode, debit: remaining, credit: 0, drawer_id: drawerId, bank_account_id: bankAccountId, memo: 'Return corrected expense payment' });
        lines.push({ code: '5020', debit: 0, credit: reduction, memo: 'Reduce corrected expense' });
      }
      await postJournal(tx, { entry_date: currentDate, memo: `Closed expense #${id} corrected — ${cleanReason}`, source_type: 'expense_edit_correction', external_ref: `expense-edit:${id}:${requestKey || Date.now()}`, created_by: performedBy, business_day_id: current.business_day_id, lines });
    }
    const next = { description: String(changes.description || '').trim(), category: String(changes.category || '').trim(), amount: nextAmount, supplier: String(changes.supplier || '').trim() || null, notes: String(changes.notes || '').trim() || null, receipt_url: String(changes.receipt_url || '').trim() || null };
    if (!next.description || !next.category) throw Object.assign(new Error('Description and category are required.'), { status: 400 });
    await tx.run(`UPDATE expenses SET description=?,category=?,amount=?,supplier=?,notes=?,receipt_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [next.description, next.category, next.amount, next.supplier, next.notes, next.receipt_url, id]);
    await tx.run(`INSERT INTO expense_change_audit (expense_id,action,reason,before_json,after_json,request_key,performed_by) VALUES (?,?,?,?,?,?,?)`, [id, 'closed_expense_correction', cleanReason, JSON.stringify(current), JSON.stringify(next), requestKey || null, performedBy]);
    return tx.get('SELECT * FROM expenses WHERE id=?', [id]);
  });
}

/**
 * Correct only the payment source of an existing expense, including one
 * from a closed day. The original journal remains intact; a balanced
 * reclassification journal records who changed it and why.
 */
export async function correctExpensePaymentMethod(db, {
  expenseId, paymentMethod, reason, performedBy = null, requestKey = null,
} = {}) {
  const id = Number(expenseId);
  if (!Number.isInteger(id) || id <= 0) {
    throw Object.assign(new Error('Choose a valid expense.'), { status: 400 });
  }
  const cleanReason = String(reason || '').trim();
  if (cleanReason.length < 3) {
    throw Object.assign(new Error('Enter a clear reason for this payment correction.'), { status: 400 });
  }
  const nextMethod = normalizePaymentMethod(paymentMethod);
  await ensureExpenseVoidSchema(db);
  await ensureAccountingSchema(db);

  return db.transaction(async (tx) => {
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    const expense = await tx.get(
      `SELECT e.*,bd.business_date
       FROM expenses e LEFT JOIN business_days bd ON bd.id=e.business_day_id
       WHERE e.id=?${lock}`,
      [id]
    );
    if (!expense) throw Object.assign(new Error('Expense not found.'), { status: 404 });
    if (String(expense.status || 'active').toLowerCase() === 'voided') {
      throw Object.assign(new Error('A voided expense cannot be corrected.'), { status: 409 });
    }
    const previousMethod = normalizePaymentMethod(expense.payment_method || 'cash');
    const allowed = ['cash', 'online', 'business_funding', 'owner_pocket'];
    if (!allowed.includes(nextMethod)) {
      throw Object.assign(new Error(`Use one of these payment methods: ${allowed.join(', ')}.`), { status: 400 });
    }
    if (previousMethod === nextMethod) {
      throw Object.assign(new Error('This record already uses that payment method.'), { status: 409 });
    }

    const amount = round2(expense.amount);
    if (!(amount > 0)) throw Object.assign(new Error('Only a positive expense can be corrected.'), { status: 409 });
    const previousCode = expensePaymentAccount(expense, previousMethod);
    const nextCode = expensePaymentAccount(expense, nextMethod);
    if (previousCode === nextCode) {
      await tx.run(`UPDATE expenses SET payment_method=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [nextMethod, id]);
      return { expense_id: id, amount, previous_method: previousMethod, method: nextMethod, journal_id: null };
    }

    const entryDate = databaseDateKey(
      expense.business_date || expense.purchase_date || expense.expense_date || nepalDateString()
    );
    const dayDrawer = expense.business_day_id
      ? await tx.get(`SELECT drawer_id FROM drawer_sessions WHERE business_day_id=? ORDER BY opened_at,id LIMIT 1`, [expense.business_day_id]).catch(() => null)
      : null;
    const drawerId = dayDrawer?.drawer_id || await currentDrawerId(tx);
    const bankAccountId = await primaryBankAccountId(tx);

    // The old auto-funding top-up formed part of the original payment source.
    // Neutralize it only on the first correction; later corrections move the
    // already-reclassified full amount between methods.
    const earlierCorrection = await tx.get(
      `SELECT id FROM journal_entries WHERE source_type='expense_payment_method_correction'
       AND external_ref LIKE ? LIMIT 1`,
      [`expense-payment-method:${id}:%`]
    );
    let originalFunding = 0;
    if (!earlierCorrection) {
      const fundingRow = await tx.get(
        `SELECT COALESCE(SUM(CASE WHEN a.code='1050' THEN jl.credit-jl.debit ELSE 0 END),0) AS amount
         FROM journal_entries je JOIN journal_lines jl ON jl.journal_id=je.id
         JOIN accounts a ON a.id=jl.account_id
         WHERE je.source_type='business_funding_use' AND je.source_id=?`,
        [id]
      ).catch(() => null);
      originalFunding = Math.max(0, Math.min(amount, round2(fundingRow?.amount)));
    }

    if (nextCode === '1050') {
      // Use current funding pool (not as-of historical date) so available funds
      // can cover a payment-method correction on an older expense.
      const available = round2(await accountBalance(tx, '1050')) + originalFunding;
      if (available + 0.001 < amount) {
        throw Object.assign(
          new Error(`Business Funding has Rs ${available.toFixed(2)} available, but Rs ${amount.toFixed(2)} is required.`),
          { status: 409, code: 'business_funding_insufficient', available, shortfall: round2(amount - available) }
        );
      }
    }

    const oldMediumAmount = round2(amount - originalFunding);
    const tags = (code, debit) => ({
      code,
      debit: debit ? oldMediumAmount : 0,
      credit: debit ? 0 : amount,
      drawer_id: code === '1010' ? drawerId : null,
      bank_account_id: code === '1020' ? bankAccountId : null,
    });
    const lines = [];
    if (oldMediumAmount > 0) lines.push({ ...tags(previousCode, true), memo: `Remove mistaken ${previousMethod}` });
    if (originalFunding > 0) lines.push({ code: '1050', debit: originalFunding, credit: 0, memo: 'Neutralize original funding top-up' });
    lines.push({ ...tags(nextCode, false), memo: `Corrected to ${nextMethod}` });

    const requestToken = String(requestKey || '').trim();
    const externalRef = requestToken.startsWith(`expense-payment-method:${id}:`)
      ? requestToken
      : `expense-payment-method:${id}:${requestToken || Date.now()}`;
    const journalId = await postJournal(tx, {
      entry_date: entryDate,
      memo: `Expense payment corrected — #${id}: ${previousMethod} to ${nextMethod}. ${cleanReason}`,
      source_type: 'expense_payment_method_correction',
      source_id: null,
      external_ref: externalRef,
      created_by: performedBy,
      business_day_id: expense.business_day_id || null,
      lines,
    });
    await tx.run(`UPDATE expenses SET payment_method=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [nextMethod, id]);
    return { expense_id: id, amount, previous_method: previousMethod, method: nextMethod, journal_id: journalId };
  });
}

/** Closed-day edit / payment-method corrections for one expense (by external_ref). */
async function listExpenseCorrectionJournals(db, expenseId) {
  return db.all(
    `SELECT id, source_type FROM journal_entries
     WHERE source_type IN ('expense_edit_correction','expense_payment_method_correction')
       AND (external_ref LIKE ? OR external_ref LIKE ?)
     ORDER BY id ASC`,
    [`expense-edit:${expenseId}:%`, `expense-payment-method:${expenseId}:%`]
  );
}

async function reverseExpenseCorrectionJournals(db, expenseId, {
  reason, performedBy = null, businessDayId = null,
} = {}) {
  const rows = await listExpenseCorrectionJournals(db, expenseId);
  for (const row of rows) {
    const already = await db.get(
      `SELECT id FROM journal_entries WHERE source_type='reversal' AND source_id=?`,
      [row.id]
    );
    if (already) continue;
    await reverseJournal(db, {
      journal_id: row.id,
      reason: reason || `Reverse correction journal #${row.id}`,
      created_by: performedBy,
      business_day_id: businessDayId,
    });
  }
}

/**
 * Audit-safe expense void. The source row remains visible as voided and the
 * original journal remains intact; a contra journal removes its financial
 * effect. This is the operational counterpart generic journal reversal was
 * missing.
 */
export async function voidExpense(db, id, {
  reason, performedBy = null, businessDayId = null, withinTransaction = false,
} = {}) {
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw Object.assign(new Error('A reason is required to void an expense.'), { status: 400 });
  await ensureExpenseVoidSchema(db);
  await ensureAccountingSchema(db);
  const dayId = businessDayId || await currentBusinessDayId(db, { required: true, allowStale: true });

  const performVoid = async (tx) => {
    const expense = await tx.get('SELECT * FROM expenses WHERE id=?', [id]);
    if (!expense) throw Object.assign(new Error('Expense not found.'), { status: 404 });
    if (String(expense.status || 'active').toLowerCase() === 'voided') {
      throw Object.assign(new Error('This expense is already voided.'), { status: 409 });
    }
    const journal = await tx.get(
      `SELECT id FROM journal_entries WHERE source_type='expense' AND source_id=? ORDER BY id DESC LIMIT 1`,
      [expense.id]
    );
    let reversalId = null;
    if (journal) {
      reversalId = await reverseJournal(tx, {
        journal_id: journal.id,
        reason: `Void expense #${expense.id}: ${cleanReason}`,
        created_by: performedBy,
        business_day_id: dayId,
      });
    }
    const fundingJournal = await tx.get(
      `SELECT id FROM journal_entries WHERE source_type='business_funding_use' AND source_id=? ORDER BY id DESC LIMIT 1`,
      [expense.id]
    );
    if (fundingJournal) {
      await reverseJournal(tx, {
        journal_id: fundingJournal.id,
        reason: `Reverse funding for voided expense #${expense.id}: ${cleanReason}`,
        created_by: performedBy,
        business_day_id: dayId,
      });
    }
    // Closed-day edit / payment corrections must reverse too, or cash/expense
    // balances keep the delta after the original expense is voided.
    await reverseExpenseCorrectionJournals(tx, expense.id, {
      reason: `Void expense #${expense.id} corrections: ${cleanReason}`,
      performedBy,
      businessDayId: dayId,
    });
    await tx.run(
      `UPDATE expenses SET status='voided',void_reason=?,voided_at=CURRENT_TIMESTAMP,voided_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [cleanReason, performedBy, expense.id]
    );
    return { ...expense, status: 'voided', void_reason: cleanReason, reversal_journal_id: reversalId };
  };
  return withinTransaction ? performVoid(db) : db.transaction(performVoid);
}
