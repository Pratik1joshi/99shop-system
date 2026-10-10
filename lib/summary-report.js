import { ensureAccountingSchema } from '@/lib/accounting.js';
import { ensureSavingsSchema } from '@/lib/savings.js';
import { ensureSupplierSchema } from '@/lib/suppliers.js';
import { ensurePayrollSchema } from '@/lib/payroll.js';
import { dateKey } from '@/lib/report-tabs.js';
import { JOURNAL_BASIS_NOTE } from '@/lib/report-scope.js';
import { recordedCashMovements, summarizeBillComposition } from '@/lib/summary-account.js';
import { ensureColumn } from '@/lib/db/schema-helpers.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (row, key) => Number(row?.[key] || 0);
const BANK_CODES = "'1020','1100','1110','1120','1130','1140'";

function combineMedia(...rows) {
  const out = { cash: 0, bank: 0, credit: 0, total: 0 };
  for (const row of rows) {
    out.cash += num(row, 'cash');
    out.bank += num(row, 'bank');
    out.credit += num(row, 'credit');
  }
  out.cash = round2(out.cash); out.bank = round2(out.bank); out.credit = round2(out.credit);
  out.total = round2(out.cash + out.bank + out.credit);
  return out;
}

async function journalMedia(db, from, to, sources) {
  const placeholders = sources.map(() => '?').join(',');
  const rows = await db.all(`SELECT a.code,COALESCE(SUM(jl.debit-jl.credit),0) AS amount
    FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_id JOIN accounts a ON a.id=jl.account_id
    WHERE je.entry_date BETWEEN ? AND ? AND je.source_type IN (${placeholders})
      AND a.code IN ('1010','1020','1100','1110','1120','1130','1140','1300','2030') GROUP BY a.code`, [from, to, ...sources]);
  const out = { cash: 0, bank: 0, credit: 0, store_credit: 0 };
  for (const r of rows) {
    const value = round2(r.amount);
    if (r.code === '1010') out.cash += value;
    else if (r.code === '1300') out.credit += value;
    else if (r.code === '2030') out.store_credit += value; // paid with / refunded as store credit
    else out.bank += value;
  }
  out.cash = round2(out.cash); out.bank = round2(out.bank); out.credit = round2(out.credit); out.store_credit = round2(out.store_credit);
  out.total = round2(out.cash + out.bank + out.credit + out.store_credit);
  return out;
}

/**
 * Stock bought through Purchases (goods receipts) less purchase returns, split
 * by how it was paid — the account the receipt credited.
 */
async function goodsReceiptSpending(db, from, to) {
  const rows = await db.all(`SELECT a.code, COALESCE(SUM(jl.credit-jl.debit),0) AS amount
    FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_id
    LEFT JOIN journal_entries original ON je.source_type='reversal' AND original.id=je.source_id
    JOIN accounts a ON a.id=jl.account_id
    WHERE je.entry_date BETWEEN ? AND ? AND COALESCE(original.source_type,je.source_type) IN ('goods_receipt','purchase_return')
      AND a.code IN ('1010','1020','1100','1110','1120','1130','1140','2010','3010','1050')
    GROUP BY a.code`, [from, to]).catch(() => []);
  const out = { cash: 0, bank: 0, credit: 0, funding: 0 };
  for (const r of rows) {
    const amount = round2(r.amount);
    if (r.code === '1010') out.cash += amount;
    else if (r.code === '2010') out.credit += amount;
    else if (r.code === '3010' || r.code === '1050') out.funding += amount;
    else out.bank += amount;
  }
  const records = await db.get(`SELECT COUNT(*) AS n FROM journal_entries WHERE source_type='goods_receipt' AND entry_date BETWEEN ? AND ?`, [from, to]).catch(() => ({ n: 0 }));
  return { ...out, records: num(records, 'n') };
}

async function spending(db, from, to, condition) {
  // Split by how the expense journal was credited (cash/bank vs 1050 funding),
  // not only payment_method — a cash purchase funded in part from Business Funding
  // must not report the full amount as Business Cash.
  const rows = await db.all(
    `SELECT a.code,
            COALESCE(SUM(CASE WHEN je.source_type='reversal' THEN -jl.debit ELSE jl.credit END),0) AS amount
     FROM expenses e
     JOIN journal_entries je ON je.source_type='expense' AND je.source_id=e.id
     JOIN journal_lines jl ON jl.journal_id=je.id
     JOIN accounts a ON a.id=jl.account_id
     WHERE COALESCE(e.purchase_date,CAST(e.expense_date AS TEXT)) BETWEEN ? AND ?
       AND ${condition}
       AND LOWER(COALESCE(e.status,'active'))<>'voided'
       AND (jl.credit > 0 OR (je.source_type='reversal' AND jl.debit > 0))
       AND a.code IN ('1010','1020','1100','1110','1120','1130','1140','2010','3010','1050')
     GROUP BY a.code`,
    [from, to]
  );

  const out = { cash: 0, bank: 0, credit: 0, funding: 0, records: 0 };
  for (const r of rows || []) {
    const amount = round2(r.amount);
    if (r.code === '1010') out.cash += amount;
    else if (r.code === '2010') out.credit += amount;
    else if (r.code === '3010' || r.code === '1050') out.funding += amount;
    else out.bank += amount;
  }

  // Fallback for expenses that never got a journal (should be rare).
  const orphan = await db.get(
    `SELECT COALESCE(SUM(e.amount),0) AS amount, COUNT(*) AS records
     FROM expenses e
     WHERE COALESCE(e.purchase_date,CAST(e.expense_date AS TEXT)) BETWEEN ? AND ?
       AND ${condition}
       AND LOWER(COALESCE(e.status,'active'))<>'voided'
       AND NOT EXISTS (
         SELECT 1 FROM journal_entries je
         WHERE je.source_type='expense' AND je.source_id=e.id
       )`,
    [from, to]
  ).catch(() => ({ amount: 0, records: 0 }));
  if (Number(orphan?.amount || 0) > 0) {
    const methodRows = await db.all(
      `SELECT LOWER(COALESCE(payment_method,'cash')) AS method, COALESCE(SUM(amount),0) AS amount
       FROM expenses e
       WHERE COALESCE(e.purchase_date,CAST(e.expense_date AS TEXT)) BETWEEN ? AND ?
         AND ${condition}
         AND LOWER(COALESCE(e.status,'active'))<>'voided'
         AND NOT EXISTS (
           SELECT 1 FROM journal_entries je
           WHERE je.source_type='expense' AND je.source_id=e.id
         )
       GROUP BY LOWER(COALESCE(payment_method,'cash'))`,
      [from, to]
    ).catch(() => []);
    for (const r of methodRows || []) {
      if (r.method === 'cash') out.cash += num(r, 'amount');
      else if (['credit', 'due', 'unpaid', 'on_credit', 'payable'].includes(r.method)) out.credit += num(r, 'amount');
      else if (['owner_pocket', 'business_funding'].includes(r.method)) out.funding += num(r, 'amount');
      else out.bank += num(r, 'amount');
    }
  }

  const counted = await db.get(
    `SELECT COUNT(*) AS records FROM expenses e
     WHERE COALESCE(e.purchase_date,CAST(e.expense_date AS TEXT)) BETWEEN ? AND ?
       AND ${condition}
       AND LOWER(COALESCE(e.status,'active'))<>'voided'`,
    [from, to]
  ).catch(() => ({ records: 0 }));
  out.records = Number(counted?.records || 0);
  out.cash = round2(out.cash);
  out.bank = round2(out.bank);
  out.credit = round2(out.credit);
  out.funding = round2(out.funding);
  out.total = round2(out.cash + out.bank + out.credit + out.funding);
  return out;
}

async function accountWindow(db, codeSql, from, to) {
  const opening = await db.get(`SELECT COALESCE(SUM(jl.debit-jl.credit),0) AS value FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_id JOIN accounts a ON a.id=jl.account_id WHERE a.code IN (${codeSql}) AND je.entry_date < ?`, [from]);
  // Attribute a compensating entry to the source and side it undoes. This
  // makes a corrected Cash In reduce Cash In instead of inventing Cash Out.
  const movements = await db.all(`SELECT
    COALESCE(original.source_type,je.source_type,'manual') AS source,
    COALESCE(SUM(CASE WHEN je.source_type='reversal' THEN -jl.credit ELSE jl.debit END),0) AS debit,
    COALESCE(SUM(CASE WHEN je.source_type='reversal' THEN -jl.debit ELSE jl.credit END),0) AS credit
    FROM journal_lines jl
    JOIN journal_entries je ON je.id=jl.journal_id
    LEFT JOIN journal_entries original ON je.source_type='reversal' AND original.id=je.source_id
    JOIN accounts a ON a.id=jl.account_id
    WHERE a.code IN (${codeSql}) AND je.entry_date BETWEEN ? AND ?
    GROUP BY COALESCE(original.source_type,je.source_type,'manual')`, [from,to]);
  const bySource = Object.fromEntries(movements.map(r => [r.source,{ debit:round2(r.debit), credit:round2(r.credit), net:round2(num(r,'debit')-num(r,'credit')) }]));
  const open = round2(opening.value); const net = round2(movements.reduce((s,r)=>s+num(r,'debit')-num(r,'credit'),0));
  return { opening: open, movements: bySource, closing: round2(open+net) };
}

/**
 * Journals that only bridge yesterday's counted cash into today's declared
 * opening float. Those amounts are already represented by business_days.opening_cash
 * — counting them again as a day movement double-subtracts (opening 0 + movement
 * -6965 looks like -6965 when the drawer simply started empty).
 *
 * Mid-day store_session_reopened movements stay in the window: day.opening_cash
 * is still the morning float, so later remove/add must affect closing.
 */
const DAY_OPEN_BRIDGE_SQL = `
  NOT (
    je.source_type IN ('opening_cash_movement', 'opening_cash_alignment')
    AND (
      COALESCE(je.external_ref,'') LIKE '%:store_session_opened:%'
      OR COALESCE(je.external_ref,'') LIKE 'opening-cash-align:%:store_session_opened:%'
    )
  )
`;

/**
 * A one-day owner summary should reconcile to the shop's recorded
 * business day, not silently switch to midnight-to-midnight ledger scope.
 * Day-open bridge journals are already represented by the declared physical
 * opening and are therefore excluded from the movement window.
 */
async function cashWindowForRange(db, from, to) {
  if (from !== to) return accountWindow(db, "'1010'", from, to);
  const day = await db.get(
    `SELECT bd.id, bd.opening_cash
     FROM business_days bd
     WHERE bd.business_date = ? LIMIT 1`,
    [from]
  ).catch(() => null);
  if (!day) return accountWindow(db, "'1010'", from, to);

  const rows = await db.all(
    `SELECT COALESCE(original.source_type,je.source_type,'manual') AS source,
            COALESCE(SUM(CASE WHEN je.source_type='reversal' THEN -jl.credit ELSE jl.debit END),0) AS debit,
            COALESCE(SUM(CASE WHEN je.source_type='reversal' THEN -jl.debit ELSE jl.credit END),0) AS credit
     FROM journal_lines jl
     JOIN journal_entries je ON je.id=jl.journal_id
     LEFT JOIN journal_entries original ON je.source_type='reversal' AND original.id=je.source_id
     JOIN accounts a ON a.id=jl.account_id
     WHERE a.code='1010' AND je.business_day_id=?
       AND COALESCE(je.source_type,'') NOT IN ('drawer_open','drawer')
       AND ${DAY_OPEN_BRIDGE_SQL}
     GROUP BY COALESCE(original.source_type,je.source_type,'manual')`,
    [day.id]
  );
  const movements = Object.fromEntries(rows.map((row) => [row.source, {
    debit: round2(row.debit), credit: round2(row.credit),
    net: round2(num(row, 'debit') - num(row, 'credit')),
  }]));
  // This is a whole-business-day report, so start from the day's first opening
  // and include cash moved between same-day store sessions. Using the latest
  // session opening with all-day sales double-counted activity from earlier
  // sessions and hid the corresponding opening_cash_movement.
  const opening = round2(day.opening_cash);
  const net = round2(rows.reduce((sum, row) => sum + num(row, 'debit') - num(row, 'credit'), 0));
  return { opening, movements, closing: round2(opening + net), basis: 'business_day', business_day_id: Number(day.id) };
}

/**
 * Digital media (QR, card, wallet, bank) split by WHY the money arrived.
 *
 * The same eSewa or Fonepay account receives two completely different things:
 *
 *   shop sale         a customer paid for goods. This is revenue.
 *   money exchange    a customer sent digital money and took cash out of the
 *                     drawer. Not revenue — the shop only earns the charge,
 *                     and the drawer is lighter by the payout.
 *
 * Read as one lump they overstate trade and hide why the drawer is empty, so
 * they are reported side by side here. The split is the journal's source_type,
 * which is set at posting time and never guessed.
 *
 * Amounts are signed debit-credit on the asset account: money in is positive,
 * money paid back out (a refund, a void reversal) is negative.
 */
// Clearing accounts only. 1020 is the bank account itself: it also carries
// every bank-paid purchase and expense, so listing it as a "received" medium
// made a supplier payment read as negative QR sales.
const DIGITAL_ACCOUNTS = [['1020', 'Online']];

export async function digitalReceipts(db, from, to) {
  const codes = DIGITAL_ACCOUNTS.map(([code]) => `'${code}'`).join(',');
  const rows = await db.all(
    `SELECT a.code AS code,
            CASE
              WHEN je.source_type = 'exchange' OR original.source_type = 'exchange' THEN 'exchange'
              WHEN je.source_type = 'retail_sale' THEN 'sales'
              WHEN je.source_type = 'retail_credit_collection' THEN 'collections'
              WHEN je.source_type = 'retail_return' THEN 'reversals'
              WHEN je.source_type = 'reversal' AND original.source_type IN ('retail_credit_collection','retail_return','retail_sale') THEN 'reversals'
              WHEN je.source_type = 'settlement' THEN 'settlements'
              ELSE 'other'
            END AS bucket,
            COALESCE(SUM(jl.debit - jl.credit), 0) AS amount
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_id
     LEFT JOIN journal_entries original ON je.source_type='reversal' AND original.id=je.source_id
     JOIN accounts a ON a.id = jl.account_id
     WHERE a.code IN (${codes}) AND je.entry_date BETWEEN ? AND ?
     GROUP BY a.code, 2`,
    [from, to]
  ).catch(() => []);

  const byCode = new Map(DIGITAL_ACCOUNTS.map(([code, label]) => [code, {
    code, label, sales: 0, collections: 0, reversals: 0, exchange: 0, settlements: 0, other: 0, total: 0,
  }]));
  for (const r of rows || []) {
    const row = byCode.get(String(r.code));
    if (!row) continue;
    row[r.bucket] = round2(num(row, r.bucket) + num(r, 'amount'));
  }

  const media = [];
  const totals = { sales: 0, collections: 0, reversals: 0, exchange: 0, settlements: 0, other: 0, total: 0 };
  for (const row of byCode.values()) {
    // `total` is money RECEIVED. A settlement is the same money leaving the
    // clearing account for the bank, so counting it here would cancel out the
    // takings it is paying over; it stays on the row for anyone who wants it.
    row.total = round2(row.sales + row.collections + row.reversals + row.exchange);
    for (const key of Object.keys(totals)) totals[key] = round2(totals[key] + row[key]);
    media.push(row);
  }
  // Media that never moved are dropped: a ladder of zero rows buries the two
  // lines that did.
  return { media: media.filter((r) => r.total !== 0 || r.sales !== 0 || r.exchange !== 0), totals };
}

/**
 * Where the drawer's cash came from and where it went, by source.
 *
 * Built from the 1010 movements the period already reads (accountWindow), so
 * it cannot drift from Cash in Hand: opening + in - out = closing, exactly.
 * `in` is the debit side, `out` the credit side — a source that did both
 * (money exchange takes digital in and pays cash out, so it only ever credits
 * cash; a manual adjustment can do either) shows on both sides honestly.
 */
const CASH_SOURCE_LABELS = {
  retail_sale: 'Shop sales',
  retail_return: 'Returns refunded',
  retail_credit_collection: 'Credit collected',
  goods_receipt: 'Stock purchases',
  purchase_return: 'Purchase returns',
  reversal: 'Void reversals',
  expense: 'Operating expenses',
  payroll: 'Salary paid',
  savings_deposit: 'Moved to savings',
  exchange: 'Money exchange payouts',
  drawer_open: 'Drawer opening',
  opening_cash_movement: 'Opening adjustment',
  opening_cash_alignment: 'Opening count alignment',
  business_day_close: 'Cash over / short at close',
  business_funding_use: 'Business Funding',
  cash_movement: 'Recorded cash movement',
  supplier_payment: 'Supplier payments',
  salary_advance: 'Salary advances',
  savings_deposit_void: 'Reversed savings deposits',
  settlement: 'Bank settlement',
  manual: 'Manual adjustment',
};

const sourceLabel = (key) =>
  CASH_SOURCE_LABELS[key] || String(key || 'other').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export function cashFlowFromAccount(account) {
  const inflow = [];
  const outflow = [];
  for (const [source, move] of Object.entries(account?.movements || {})) {
    const debit = round2(move.debit);
    const credit = round2(move.credit);
    if (debit > 0) inflow.push({ source, label: sourceLabel(source), amount: debit });
    if (debit < 0) outflow.push({ source: `${source}_in_reversal`, label: `Reversed ${sourceLabel(source)} in`, amount: Math.abs(debit) });
    if (credit > 0) outflow.push({ source, label: sourceLabel(source), amount: credit });
    if (credit < 0) inflow.push({ source: `${source}_out_reversal`, label: `Reversed ${sourceLabel(source)} out`, amount: Math.abs(credit) });
  }
  inflow.sort((a, b) => b.amount - a.amount);
  outflow.sort((a, b) => b.amount - a.amount);
  const totalIn = round2(inflow.reduce((s, r) => s + r.amount, 0));
  const totalOut = round2(outflow.reduce((s, r) => s + r.amount, 0));
  return {
    opening: round2(account?.opening),
    inflow,
    outflow,
    total_in: totalIn,
    total_out: totalOut,
    net: round2(totalIn - totalOut),
    closing: round2(account?.closing),
  };
}

/**
 * Balances as they stand on a date, split the way an owner holds the money.
 *
 * A digital payment does NOT land in the bank when the guest pays it. It sits
 * in a clearing account (QR, eSewa, Khalti, card, online) until someone records
 * the settlement that moves it to 1020 — see settlePayments() in
 * lib/accounting-cash.js. So there are two honest answers to "what is in the
 * bank", and reporting one of them as the other is what made two screens
 * disagree:
 *
 *   settled   1020 alone — what the ledger says is in the bank account today.
 *   pending   the clearing accounts — taken from customers, not yet paid over
 *             by the provider (or not yet recorded as settled).
 *   expected  settled + pending — what should be in the bank once every
 *             pending payout lands. This is the number to check a statement
 *             against.
 *
 * A deeply negative `settled` with a large `pending` is the signature of
 * settlements never being recorded: bank-paid purchases and expenses keep
 * crediting 1020 while the digital takings pile up in clearing and never
 * arrive. Opening a set of books without posting the bank's opening balance
 * does the same thing.
 */
export async function bankPosition(db, asOf) {
  const rows = await db.all(
    `SELECT a.code AS code, COALESCE(SUM(jl.debit - jl.credit), 0) AS amount
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_id
     JOIN accounts a ON a.id = jl.account_id
     WHERE a.code IN (${BANK_CODES}) AND je.entry_date <= ?
     GROUP BY a.code`,
    [asOf]
  ).catch(() => []);

  let settled = 0;
  const pendingByCode = [];
  let pending = 0;
  for (const r of rows || []) {
    const amount = round2(r.amount);
    if (String(r.code) === '1020') { settled = round2(settled + amount); continue; }
    pending = round2(pending + amount);
    if (amount !== 0) {
      const label = (DIGITAL_ACCOUNTS.find(([code]) => code === String(r.code)) || [])[1] || String(r.code);
      pendingByCode.push({ code: String(r.code), label, amount });
    }
  }
  pendingByCode.sort((a, b) => b.amount - a.amount);
  return { as_of: asOf, settled, pending, pending_by_medium: pendingByCode, expected: round2(settled + pending) };
}

/**
 * One place that answers "where is the money" — the cash drawer's in and out,
 * the QR/digital takings split into trade and money exchange, and what should
 * be sitting in the bank today.
 *
 * Every figure is reused from the builders the individual cards already use, so
 * this card can never disagree with the cards beside it.
 */
export async function moneyPosition(db, from, to) {
  const [flow, digital, bank] = await Promise.all([
    cashFlow(db, from, to),
    digitalReceipts(db, from, to),
    bankPosition(db, to),
  ]);
  const t = digital.totals;
  // Trade only: sales, credit collected, less returns booked back
  // to the medium. Settlements and stray movements are not sales.
  const shopSales = round2(num(t, 'sales') + num(t, 'collections') + num(t, 'reversals'));
  return {
    range: { start: from, end: to },
    cash: {
      opening: flow.opening, in: flow.total_in, out: flow.total_out,
      net: flow.net, closing: flow.closing,
    },
    qr: { shopSales, exchange: round2(num(t, 'exchange')), total: round2(shopSales + num(t, 'exchange')) },
    bank,
  };
}

/** Cash in/out for a period, for callers that do not already hold the account. */
export async function cashFlow(db, from, to) {
  return cashFlowFromAccount(await accountWindow(db, "'1010'", from, to));
}

async function reversalMediaFor(db, from, to, originalSources) {
  const sources = [].concat(originalSources);
  const rows = await db.all(`SELECT a.code,COALESCE(SUM(jl.debit-jl.credit),0) AS amount
    FROM journal_entries reversal
    JOIN journal_entries original ON original.id=reversal.source_id
    JOIN journal_lines jl ON jl.journal_id=reversal.id
    JOIN accounts a ON a.id=jl.account_id
    WHERE reversal.entry_date BETWEEN ? AND ? AND reversal.source_type='reversal'
      AND original.source_type IN (${sources.map(() => '?').join(',')}) AND a.code IN ('1010','1020','1100','1110','1120','1130','1140','1300')
    GROUP BY a.code`, [from, to, ...sources]);
  const out = { cash: 0, bank: 0, credit: 0 };
  for (const row of rows) {
    const value = round2(row.amount);
    if (row.code === '1010') out.cash += value;
    else if (row.code === '1300') out.credit += value;
    else out.bank += value;
  }
  out.cash=round2(out.cash); out.bank=round2(out.bank); out.credit=round2(out.credit);
  out.total=round2(out.cash+out.bank+out.credit);
  return out;
}

/** Individual operator-entered drawer movements, including their audit memo. */
export async function cashMovementDetails(db, from, to) {
  const rows = await db.all(
    `SELECT je.id, je.entry_date, je.memo, je.source_type,
            original.id AS reversed_journal_id, original.memo AS original_memo,
            COALESCE(SUM(jl.debit),0) AS cash_in,
            COALESCE(SUM(jl.credit),0) AS cash_out
     FROM journal_entries je
     LEFT JOIN journal_entries original ON je.source_type='reversal' AND original.id=je.source_id
     JOIN journal_lines jl ON jl.journal_id=je.id
     JOIN accounts a ON a.id=jl.account_id
     WHERE a.code='1010'
       AND (COALESCE(je.source_type,'manual') IN ('cash_movement','manual')
         OR (je.source_type='reversal' AND COALESCE(original.source_type,'') IN ('cash_movement','manual')))
       AND je.entry_date BETWEEN ? AND ?
     GROUP BY je.id,je.entry_date,je.memo,je.source_type,original.id,original.memo
     ORDER BY je.entry_date,je.id`,
    [from, to]
  ).catch(() => []);
  return (rows || []).map((row) => ({
    id: row.id,
    entry_date: dateKey(row.entry_date),
    memo: row.memo || 'Recorded cash movement',
    is_reversal: row.source_type === 'reversal',
    reversed_journal_id: row.reversed_journal_id || null,
    original_memo: row.original_memo || null,
    cash_in: round2(row.cash_in),
    cash_out: round2(row.cash_out),
  }));
}

/**
 * Closed-day cash reconciliation for the period — expected/counted/difference
 * plus the note-count breakdown, summed across every business day the range
 * covers. Note counts are optional at close time (see business-days.js), so
 * days_recorded can be less than days_total.
 */
export async function closingReconciliation(db, from, to) {
  const rows = await db.all(
    `SELECT bd.business_date, bd.status,
            COALESCE(s.expected_cash,bd.expected_cash) AS expected_cash,
            COALESCE(s.counted_cash,bd.counted_cash) AS counted_cash,
            COALESCE(s.cash_difference,bd.cash_difference) AS cash_difference,
            COALESCE(s.closing_note,bd.closing_note) AS closing_note,
            COALESCE(s.closing_snapshot,bd.closing_snapshot) AS closing_snapshot,
            COALESCE(s.force_closed,bd.force_closed,0) AS force_closed
     FROM business_days bd
     LEFT JOIN business_day_sessions s ON s.business_day_id=bd.id
       AND s.status='closed'
       AND s.session_number=(SELECT MAX(s2.session_number) FROM business_day_sessions s2
                             WHERE s2.business_day_id=bd.id AND s2.status='closed')
     WHERE bd.business_date BETWEEN ? AND ? ORDER BY bd.business_date`,
    [from, to]
  ).catch(() => []);
  const postClose = await db.get(
    `SELECT COUNT(DISTINCT r.id) AS entries,
            COALESCE(SUM(jl.debit-jl.credit),0) AS cash_delta
     FROM journal_entries r
     LEFT JOIN journal_entries original ON original.id=r.source_id
     JOIN business_days bd ON bd.id=COALESCE(original.business_day_id,r.business_day_id)
     LEFT JOIN business_day_sessions s ON s.business_day_id=bd.id AND s.status='closed'
       AND s.session_number=(SELECT MAX(s2.session_number) FROM business_day_sessions s2
                             WHERE s2.business_day_id=bd.id AND s2.status='closed')
     JOIN journal_lines jl ON jl.journal_id=r.id
     JOIN accounts a ON a.id=jl.account_id
     WHERE r.source_type IN ('reversal','expense','expense_payment_method_correction','expense_edit_correction')
       AND a.code='1010' AND bd.business_date BETWEEN ? AND ?
       AND (COALESCE(r.business_day_id,0)<>bd.id OR r.created_at>COALESCE(s.closed_at,bd.closed_at))`,
    [from, to]
  ).catch(() => ({ entries: 0, cash_delta: 0 }));

  // A store session can be physically counted while its business day remains
  // current (it can still be reopened). Include that latest saved count rather
  // than waiting for the next day to finalize the business-day container.
  const closed = (rows || []).filter((r) => r.counted_cash != null);
  const denominations = {};
  let daysRecorded = 0;
  const notes = [];
  for (const r of closed) {
    if (r.closing_note) notes.push({ business_date: dateKey(r.business_date), note: r.closing_note, force_closed: !!r.force_closed });
    let snapshot = null;
    try { snapshot = r.closing_snapshot ? JSON.parse(r.closing_snapshot) : null; } catch { snapshot = null; }
    const counts = snapshot?.reconciliation?.cash_denominations;
    if (counts != null && typeof counts === 'object') {
      daysRecorded += 1;
      for (const [denom, qty] of Object.entries(counts)) {
        denominations[denom] = (denominations[denom] || 0) + Number(qty || 0);
      }
    }
  }

  const expectedCash = round2(closed.reduce((s, r) => s + num(r, 'expected_cash'), 0));
  const countedCash = round2(closed.reduce((s, r) => s + num(r, 'counted_cash'), 0));
  const cashDelta = round2(postClose?.cash_delta);
  return {
    expected_cash: expectedCash,
    adjusted_expected_cash: round2(expectedCash + cashDelta),
    post_close_adjustments: { entries: Number(postClose?.entries || 0), cash_delta: cashDelta },
    counted_cash: countedCash,
    difference: round2(closed.reduce((s, r) => s + num(r, 'cash_difference'), 0)),
    adjusted_difference: round2(countedCash - expectedCash - cashDelta),
    cash_denominations: denominations,
    notes,
    days_total: rows.length,
    days_closed: closed.length,
    days_recorded: daysRecorded,
  };
}

export async function buildSummaryReport(db, { start, end }) {
  await ensureColumn(db, 'expenses', 'status', "TEXT DEFAULT 'active'").catch(() => {});
  await Promise.all([ensureAccountingSchema(db), ensureSavingsSchema(db), ensureSupplierSchema(db), ensurePayrollSchema(db)]);
  const { repairExpenseBusinessDayAlignment } = await import('@/lib/expense-links.js');
  const { repairFundedExpenseCashSplit } = await import('@/lib/business-funding.js');
  await repairExpenseBusinessDayAlignment(db).catch(() => 0);
  await repairFundedExpenseCashSplit(db).catch(() => 0);
  /*
   * Sales come from the posted retail_sale / retail_return journals (voids run
   * through the return engine, so they are returns here too) and stock from
   * goods receipts. Cost of goods is the exact posted COGS on 5080.
   */
  const saleIds = `SELECT source_id FROM journal_entries WHERE source_type='retail_sale' AND entry_date BETWEEN ? AND ?`;
  const lineCategory = 'JOIN menu_item_variants v ON v.id=l.variant_id JOIN menu_items mi ON mi.id=v.menu_item_id LEFT JOIN menu_categories mc ON mc.id=mi.category_id';
  const [revenue, returnMedia, returnCount, collectionMedia, collectionReversalMedia, expenses, salaryRows, cashAccount, bankAccount, savings, composition, saleCategories, cogs, purchases, purchaseCategories, settings, closing, digital, position, cashMovementRows] = await Promise.all([
    journalMedia(db,start,end,['retail_sale']),
    journalMedia(db,start,end,['retail_return']),
    db.get(`SELECT COUNT(*) AS n FROM journal_entries WHERE source_type='retail_return' AND entry_date BETWEEN ? AND ?`,[start,end]),
    journalMedia(db,start,end,['retail_credit_collection']),
    reversalMediaFor(db,start,end,['retail_credit_collection']),
    spending(db,start,end,`COALESCE(e.source_type,'')<>'purchase'`),
    db.all(`SELECT LOWER(COALESCE(method,'cash')) AS method,
                   COALESCE(SUM(amount),0) AS amount,
                   COALESCE(SUM(COALESCE(gross_amount,amount)),0) AS gross_amount,
                   COALESCE(SUM(advance_deduction),0) AS advance_deduction,
                   COUNT(*) AS records
            FROM salary_payments WHERE paid_on BETWEEN ? AND ?
            GROUP BY LOWER(COALESCE(method,'cash'))`,[start,end]),
    cashWindowForRange(db,start,end), accountWindow(db,BANK_CODES,start,end),
    db.get(`SELECT COALESCE(SUM(CASE WHEN source_account='cash' THEN amount ELSE 0 END),0) AS cash,COALESCE(SUM(CASE WHEN source_account='online' THEN amount ELSE 0 END),0) AS online,COUNT(*) AS records FROM savings_deposits WHERE status='active' AND deposit_date BETWEEN ? AND ?`,[start,end]),
    db.get(`SELECT COALESCE(SUM(subtotal),0) AS subtotal,COALESCE(SUM(discount_amount),0) AS discounts,COALESCE(SUM(tax_amount),0) AS tax,COALESCE(SUM(grand_total),0) AS finalized_total,COUNT(*) AS sales FROM retail_sales WHERE id IN (${saleIds})`,[start,end]).catch(()=>({})),
    db.all(`SELECT COALESCE(mc.name,'Uncategorised') AS category,SUM(l.quantity) AS quantity,SUM(l.quantity*l.unit_price) AS amount FROM retail_sale_lines l ${lineCategory} WHERE l.retail_sale_id IN (${saleIds}) GROUP BY COALESCE(mc.name,'Uncategorised') ORDER BY amount DESC`,[start,end]).catch(()=>[]),
    db.get(`SELECT COALESCE(SUM(jl.debit-jl.credit),0) AS amount FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_id LEFT JOIN journal_entries original ON je.source_type='reversal' AND original.id=je.source_id JOIN accounts a ON a.id=jl.account_id WHERE a.code='5080' AND je.entry_date BETWEEN ? AND ? AND COALESCE(original.source_type,je.source_type) IN ('retail_sale','retail_return')`,[start,end]).catch(()=>({amount:0})),
    goodsReceiptSpending(db,start,end),
    db.all(`SELECT COALESCE(mc.name,'Uncategorised') AS category,SUM(l.stock_quantity) AS quantity,SUM(l.net_amount) AS amount FROM goods_receipt_lines l JOIN goods_receipts g ON g.id=l.goods_receipt_id ${lineCategory} WHERE g.voided_at IS NULL AND g.id IN (SELECT source_id FROM journal_entries WHERE source_type='goods_receipt' AND entry_date BETWEEN ? AND ?) GROUP BY COALESCE(mc.name,'Uncategorised') ORDER BY amount DESC`,[start,end]).catch(()=>[]),
    db.get(`SELECT MAX(CASE WHEN setting_key='shop_name' THEN setting_value END) AS shop_name FROM system_settings`).catch(()=>({shop_name:'Shop'})),
    closingReconciliation(db, start, end),
    digitalReceipts(db, start, end),
    moneyPosition(db, start, end),
    cashMovementDetails(db, start, end),
  ]);
  const salary={cash:0,bank:0,advance_deductions:0,gross:0,records:0}; for(const r of salaryRows){if(r.method==='cash')salary.cash+=num(r,'amount');else salary.bank+=num(r,'amount');salary.advance_deductions+=num(r,'advance_deduction');salary.gross+=num(r,'gross_amount');salary.records+=num(r,'records');} salary.cash=round2(salary.cash);salary.bank=round2(salary.bank);salary.advance_deductions=round2(salary.advance_deductions);salary.gross=round2(salary.gross);
  /*
   * Salary enters operating cost at GROSS, while salary.cash / salary.bank show
   * what actually left the accounts (gross minus advances already paid out in an
   * earlier period). That is deliberate — the wage cost belongs to the period the
   * work was done in, not the period the advance happened to be handed over.
   * The two figures therefore differ by advance_deductions, by design.
   */
  salary.total=salary.gross;
  salary.net_paid=round2(salary.cash+salary.bank);
  const ledger = combineMedia(collectionMedia, collectionReversalMedia);
  const refunded=round2(-returnMedia.total);
  const grossRevenue=round2(revenue.total); const netRevenue=round2(grossRevenue-refunded);
  const received={
    gross_cash:round2(revenue.cash+ledger.cash), gross_bank:round2(revenue.bank+ledger.bank),
    refund_cash:round2(Math.max(0,-returnMedia.cash)), refund_bank:round2(Math.max(0,-returnMedia.bank)),
    void_cash:0, void_bank:0,
  };
  received.cash=round2(received.gross_cash-received.refund_cash);
  received.bank=round2(received.gross_bank-received.refund_bank);
  received.gross_total=round2(received.gross_cash+received.gross_bank);
  received.total=round2(received.cash+received.bank);
  const costOfGoods=round2(num(cogs,'amount'));
  const gross=round2(netRevenue-costOfGoods); const operating=round2(expenses.total+salary.total); const net=round2(gross-operating);
  const saleTotals = summarizeBillComposition(composition, grossRevenue);
  purchases.total = round2(purchases.cash+purchases.bank+purchases.credit+purchases.funding);
  const exchangeTotals = async (codes) => db.get(`SELECT
    COALESCE(SUM(CASE WHEN je.source_type='reversal' THEN -jl.credit ELSE jl.debit END),0) AS incoming,
    COALESCE(SUM(CASE WHEN je.source_type='reversal' THEN -jl.debit ELSE jl.credit END),0) AS outgoing
    FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_id
    LEFT JOIN journal_entries original ON je.source_type='reversal' AND original.id=je.source_id
    JOIN accounts a ON a.id=jl.account_id
    WHERE (je.source_type='exchange' OR original.source_type='exchange')
      AND a.code IN (${codes}) AND je.entry_date BETWEEN ? AND ?`,[start,end]);
  const [exchangeCash, exchangeBank] = await Promise.all([exchangeTotals("'1010'"), exchangeTotals(BANK_CODES)]);
  const exchangeFee=await db.get(`SELECT COALESCE(SUM(jl.credit-jl.debit),0) AS amount FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_id LEFT JOIN journal_entries original ON je.source_type='reversal' AND original.id=je.source_id JOIN accounts a ON a.id=jl.account_id WHERE (je.source_type='exchange' OR original.source_type='exchange') AND a.code='4020' AND je.entry_date BETWEEN ? AND ?`,[start,end]);
  const cashFlowAccount = cashFlowFromAccount(cashAccount);
  const categoryRows = (rows) => rows.map((r) => ({ category: r.category, quantity: num(r, 'quantity'), amount: round2(r.amount) }));
  return { range:{start,end}, generated_at:new Date().toISOString(), basis:JOURNAL_BASIS_NOTE,
    notes:[
      'Salary is charged to the period at gross pay. Cash and bank show what physically left the accounts, which is lower by any advance already paid out earlier — the two are meant to differ.',
      'Purchases and operating expenses are reported separately: purchases are stock, expenses are running costs.',
    ], shop_name:settings?.shop_name||'Shop', revenue:{...revenue,...saleTotals,gross:grossRevenue,refunds:refunded,voids:0,net:netRevenue,refund_count:num(returnCount,'n'),void_count:0}, ledger, received, purchases, expenses, salary,
    savings:{cash:round2(savings.cash),online:round2(savings.online),total:round2(num(savings,'cash')+num(savings,'online')),records:num(savings,'records')},
    profit:{revenue:netRevenue,cost_of_goods:costOfGoods,gross,operating,net}, accounts:{cash:cashAccount,bank:bankAccount},
    cash_register:recordedCashMovements(cashAccount),
    sale_categories:categoryRows(saleCategories), purchase_categories:categoryRows(purchaseCategories),
    exchange:{cash:{in:round2(exchangeCash.incoming),out:round2(exchangeCash.outgoing)},bank:{in:round2(exchangeBank.incoming),out:round2(exchangeBank.outgoing)},net:round2(exchangeFee.amount)},
    // QR/card/wallet takings kept apart from money-exchange traffic through
    // the same accounts, and the drawer's in/out by source.
    digital, cash_flow:{...cashFlowAccount,details:cashMovementRows},
    money_position:{...position,cash:{in:round2(cashFlowAccount.total_in),out:round2(cashFlowAccount.total_out),closing:round2(cashAccount.closing)}},
    quantities:{sold:saleCategories.reduce((sum,r)=>sum+num(r,'quantity'),0),purchased:purchaseCategories.reduce((sum,r)=>sum+num(r,'quantity'),0),sales:num(composition,'sales'),returns:num(returnCount,'n'),expenses:expenses.records,salary:salary.records,savings:num(savings,'records')},
    closing };
}
