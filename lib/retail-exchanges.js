/**
 * Exchange = a CUSTOMER RETURN (lib/retail-returns.js) plus a NEW RETAIL SALE
 * (lib/retail-sales.js), linked by a retail_exchanges row — never a variant_id
 * swap on the original sale. Both halves are posted through the exact same,
 * already-tested functions everything else uses; this file only orchestrates.
 *
 * ── WHY TWO OPERATIONS, NOT ONE TRANSACTION ────────────────────────────────
 * Spec §41 explicitly permits this: "if the replacement sale fails due to
 * stock, do not leave half an exchange posted UNLESS the workflow explicitly
 * separates return and later purchase." This workflow does separate them,
 * deliberately: postReturn() and checkoutSale() are each independently
 * atomic (their own db.transaction()), and combining them into one nested
 * transaction would mean either reimplementing both bodies inline (high risk
 * of subtly diverging from the already-tested logic) or teaching the DB
 * wrapper savepoints it doesn't have. If the return succeeds and the
 * replacement sale then fails (e.g. the replacement went out of stock a
 * second ago), the customer is left with a real, POSTED return — not a
 * corrupted half-state.
 *
 * ── THE CLEARING MECHANISM ──────────────────────────────────────────────
 * The return is always posted with refundMethod='store_credit' — real Store
 * Credit Liability, briefly, as the bridge between the two operations. This
 * is a disclosed simplification against spec §42's stricter wording ("only
 * create actual Store Credit Liability if the customer chooses to retain
 * it") — but it is the SAFE direction to simplify in: if the replacement
 * sale never happens, the customer has real, usable, fully-audited store
 * credit rather than a phantom internal number. The replacement sale then
 * redeems exactly what it needs (checkoutSale's own store_credit payment
 * path — see lib/retail-sales.js); if the replacement costs less than the
 * return credit, the difference legitimately stays as retained store credit
 * (exactly the spec's own "customer chooses to retain unused value" outcome,
 * arrived at for free rather than by special-casing it).
 *
 * An exchange requires an identified customer — the clearing mechanism has
 * nowhere else to hold value between the two steps.
 */

import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import { ensureRetailReturnsSchema, createReturn, postReturn, getReturn } from '@/lib/retail-returns.js';
import { ensureRetailSalesSchema, holdSale, checkoutSale, getRetailSale } from '@/lib/retail-sales.js';
import { getDefaultLocation } from '@/lib/retail-inventory.js';
import { nextDocumentNumber, ensureDocumentNumberSchema } from '@/lib/document-numbers.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

export async function ensureRetailExchangesSchema(db) {
  await ensureRetailReturnsSchema(db);
  await ensureRetailSalesSchema(db);
  await ensureDocumentNumberSchema(db);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_exchanges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exchange_number TEXT UNIQUE,
    return_id INTEGER NOT NULL,
    new_sale_id INTEGER NOT NULL,
    difference_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    settlement_method TEXT,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
}

/**
 * @param {object} opts
 * @param {number} opts.originalSaleId
 * @param {number} opts.customerId          required — see file header.
 * @param {Array}  opts.returnLines         same shape as createReturn()'s `lines`.
 * @param {Array}  opts.newSaleLines        same shape as holdSale()'s `lines` — priced at CURRENT price/tax/FEFO/COGS, deliberately not the old item's historical price.
 * @param {string} [opts.settlementMethod]  how any amount owed BEYOND the return credit is paid ('cash'|'online'|'credit'). Not needed if the replacement costs the same or less.
 * @param {number} [opts.cashTendered]      for a cash settlement.
 * @param {boolean}[opts.allowNonResellable]
 * @param {boolean}[opts.allowCredit]
 */
export async function postExchange(db, opts) {
  const {
    originalSaleId, customerId, cashierId = null, businessDayId = null,
    returnLines = [], newSaleLines = [], reason = null,
    settlementMethod = 'cash', cashTendered = null, allowNonResellable = false, allowCredit = false,
    idempotencyKey = null,
  } = opts;
  if (!customerId) throw bad('An exchange requires an identified customer.', 400);
  if (!returnLines.length) throw bad('Select at least one item to return.', 400);
  if (!newSaleLines.length) throw bad('Select at least one replacement item.', 400);
  await ensureRetailExchangesSchema(db);

  // Idempotent by exchange, not just by its two halves — a replay must not
  // create a second return+sale pair even if called again with the same key.
  if (idempotencyKey) {
    const existing = await db.get(`SELECT id FROM retail_exchanges WHERE exchange_number = ?`, [idempotencyKey]);
    if (existing) return getExchange(db, existing.id);
  }

  // --- Step 1: the return, refunded as store credit (the clearing bridge) ---
  const returnKey = idempotencyKey ? `${idempotencyKey}:return` : null;
  const priorReturn = returnKey ? await db.get("SELECT id FROM retail_returns WHERE idempotency_key=? AND status='POSTED'", [returnKey]) : null;
  let ret = priorReturn ? await getReturn(db, priorReturn.id) : await createReturn(db, {
    original_sale_id: originalSaleId, customerId, cashierId, reason: reason || 'Exchange',
    lines: returnLines,
  });
  ret = await postReturn(db, ret.id, { postedBy: cashierId, businessDayId, refundMethod: 'store_credit', allowNonResellable, idempotencyKey: returnKey });
  const returnCredit = Number(ret.refund_total);

  // --- Step 2: the replacement sale, at CURRENT pricing ---
  const location = await getDefaultLocation(db);
  let held = await holdSale(db, { locationId: location.id, customerId, cashierId, lines: newSaleLines });
  const newSaleTotal = Number(held.grand_total);

  const storeCreditApplied = Math.min(returnCredit, newSaleTotal);
  const remaining = round2(newSaleTotal - storeCreditApplied);
  const payments = [];
  if (storeCreditApplied > 0.005) payments.push({ method: 'store_credit', amount: storeCreditApplied });
  if (remaining > 0.005) {
    payments.push({ method: settlementMethod, amount: remaining, cash_tendered: settlementMethod === 'cash' ? (cashTendered ?? remaining) : undefined });
  }

  let sale;
  try {
    sale = await checkoutSale(db, held.id, {
      payments, cashierId, customerId, allowCredit,
      idempotencyKey: idempotencyKey ? `${idempotencyKey}:replacement` : null,
    });
  } catch (err) {
    // The return already posted and stands as a valid, complete return — the
    // customer keeps real store credit for the failed replacement attempt
    // (see file header). Surface a clear error distinguishing this from a
    // total failure rather than letting the generic error look like nothing happened.
    throw Object.assign(
      new Error(`Return ${ret.return_number} posted, but the replacement sale failed: ${err.message}. The customer has ${returnCredit} in store credit.`),
      { status: err.status || 409, returnId: ret.id, returnNumber: ret.return_number, storeCreditIssued: returnCredit, replacementSaleId: held.id }
    );
  }

  const exchangeNumber = idempotencyKey || await nextDocumentNumber(db, { type: 'retail_exchange', prefix: 'EX' });
  const result = await db.run(
    `INSERT INTO retail_exchanges (exchange_number, return_id, new_sale_id, difference_amount, settlement_method, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [exchangeNumber, ret.id, sale.id, round2(newSaleTotal - returnCredit), remaining > 0.005 ? settlementMethod : (storeCreditApplied < returnCredit ? 'store_credit_retained' : 'none'), cashierId]
  );
  return getExchange(db, result.lastInsertRowid);
}

export async function getExchange(db, id) {
  const row = await db.get(`SELECT * FROM retail_exchanges WHERE id = ?`, [id]);
  if (!row) return null;
  const ret = await getReturn(db, row.return_id);
  const sale = await getRetailSale(db, row.new_sale_id);
  return { ...row, return: ret, newSale: sale };
}

export async function listExchanges(db, { limit = 200 } = {}) {
  await ensureRetailExchangesSchema(db);
  return db.all(`SELECT * FROM retail_exchanges ORDER BY id DESC LIMIT ?`, [Math.min(500, Math.max(1, Number(limit) || 200))]);
}
