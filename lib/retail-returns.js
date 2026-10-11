/**
 * Retail customer returns, refunds and exchanges. Posted-return reversals
 * use the generic `reverseJournal` (lib/accounting-corrections.js).
 *
 * ── THE TWO-VALUE RULE ──────────────────────────────────────────────────
 * Every return line carries two independent historical numbers, both frozen
 * at the moment of the ORIGINAL sale, never today's price/cost/tax:
 *   - refund basis: unit_price, discount and tax as actually charged
 *     (derived from the immutable retail_sales/retail_sale_lines rows —
 *     header discount/tax are allocated to lines proportionally by gross
 *     amount, since Phase 4 only ever stored them at header level)
 *   - cost basis: retail_sale_lines.total_cost — the moving-average COGS
 *     Phase 4 snapshotted at sale time. A return NEVER uses today's average.
 *
 * ── DISPOSITION ACCOUNTING ─────────────────────────────────────────────
 * RETURN_TO_SELLABLE / QUARANTINE: receiveStock() at the allocated historical total cost
 *   — one movement, Dr 1210 / Cr 5080 (COGS reversal) for that amount. The
 *   only difference between the two is WHICH location (sellable default vs
 *   the non-sellable Quarantine location added in the schema migration) — quarantine
 *   stock is real on-hand quantity that getSellableStock() now excludes.
 * WRITE_OFF: the receive above, PLUS an immediate DAMAGE issueStock() out of
 *   the same quarantine location. That second leg prices at whatever the
 *   moving average becomes right after the receive blends in (same rule as
 *   every other outbound movement in this system — see lib/retail-inventory.js)
 *   which will not exactly equal the historical cost just received. That
 *   residual is real, not a bug: receiving at 120 into a variant currently
 *   averaging 150 genuinely moves the average, and the immediate write-off
 *   correctly expenses at the new blended figure. Posted as Dr 5040 (existing
 *   Inventory Loss / Damage account — reused, not a new one) / Cr 1210 for
 *   that second leg's actual value.
 * NO_STOCK_RETURN: no inventory movement, no COGS reversal — pure financial
 *   credit. Gated behind the same `allowNonResellable` authorization as any
 *   other non-standard disposition (a dedicated permission is a route-layer
 *   concern; this file just requires the flag).
 *
 * ── REVENUE/TAX REVERSAL ────────────────────────────────────────────────
 * Dr 4011 "Sales Returns" (a new contra-revenue account — nets against 4010
 * in every existing report, since lib/accounting-reports.js sums by account
 * TYPE, not hardcoded codes) and Dr 2020 (reverse the actual output VAT that
 * was charged), Cr wherever the money/liability goes: 1010 cash, 1020 bank,
 * 2030 Store Credit Liability, or 1300 AR (crediting down what the customer
 * still owed, for a return against an unpaid/partly-paid credit sale).
 *
 * ── REFUND METHOD IS AN EXPLICIT CHOICE ─────────────────────────────────
 * A mixed-payment original sale has no single correct automatic refund
 * medium (spec's own admission). This file requires the caller to state
 * refundMethod explicitly at post time rather than guessing from the
 * original payment mix; the UI can show that mix as a hint.
 */

import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import {
  ensureRetailInventorySchema, receiveStock, issueStock, getDefaultLocation, getQuarantineLocation,
} from '@/lib/retail-inventory.js';
import { postJournal, paymentAccountCode, accountBalance, currentDrawerId, primaryBankAccountId } from '@/lib/accounting.js';
import { ensureDocumentNumberSchema, nextDocumentNumber } from '@/lib/document-numbers.js';
import { currentBusinessDayId } from '@/lib/business-days.js';
import { issueStoreCredit } from '@/lib/retail-store-credit.js';
import { reversePointsForReturn } from '@/lib/retail-loyalty.js';
import { returnSerial } from '@/lib/retail-serials.js';
import { ensureColumn } from '@/lib/db/schema-helpers.js';
import { proportionalValue, allocateValue } from '@/lib/inventory-money.js';
import { ensureAfterSalesSchema } from '@/lib/retail-after-sales-schema.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

const CONDITIONS = ['RESELLABLE', 'UNOPENED', 'OPENED', 'DAMAGED', 'DEFECTIVE', 'EXPIRED', 'WRONG_ITEM', 'OTHER'];
const DISPOSITIONS = ['RETURN_TO_SELLABLE', 'QUARANTINE', 'WRITE_OFF', 'NO_STOCK_RETURN'];
// Conservative default: a condition here can only go to RETURN_TO_SELLABLE with explicit authorization.
const RISKY_CONDITIONS = new Set(['OPENED', 'DAMAGED', 'DEFECTIVE', 'EXPIRED']);

let ENSURED = false;

export async function ensureRetailReturnsSchema(db) {
  await ensureRetailInventorySchema(db);
  await ensureDocumentNumberSchema(db);

  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_number TEXT UNIQUE,
    original_sale_id INTEGER NOT NULL REFERENCES retail_sales(id),
    business_day_id INTEGER,
    customer_id INTEGER,
    cashier_id INTEGER,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    reason TEXT,
    notes TEXT,
    refund_method TEXT,
    refund_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_reversal_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    store_credit_issued NUMERIC(14,2) NOT NULL DEFAULT 0,
    without_receipt INTEGER NOT NULL DEFAULT 0,
    idempotency_key TEXT UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    posted_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_return_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retail_return_id INTEGER NOT NULL REFERENCES retail_returns(id) ON DELETE CASCADE,
    original_sale_line_id INTEGER NOT NULL REFERENCES retail_sale_lines(id),
    variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    quantity NUMERIC(14,3) NOT NULL,
    unit_price NUMERIC(14,2) NOT NULL,
    discount_allocated NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_allocated NUMERIC(14,2) NOT NULL DEFAULT 0,
    refund_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    unit_cogs NUMERIC(14,4),
    condition TEXT NOT NULL,
    disposition TEXT NOT NULL,
    batch_id INTEGER,
    reason TEXT,
    notes TEXT
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_return_line_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retail_return_line_id INTEGER NOT NULL REFERENCES retail_return_lines(id) ON DELETE CASCADE,
    batch_id INTEGER NOT NULL,
    quantity NUMERIC(14,3) NOT NULL
  )`);
  // retail_exchanges is owned by lib/retail-exchanges.js (ensureRetailExchangesSchema) —
  // not created here, this file doesn't otherwise touch it.
  await ensureColumn(db, 'retail_return_lines', 'total_cogs', 'NUMERIC(14,2)');
  ENSURED = true;
}

/** Historical per-unit refund/discount/tax basis for one sale line — never today's price. */
function lineAllocation(sale, line) {
  const share = Number(sale.subtotal) > 0 ? Number(line.net_amount) / Number(sale.subtotal) : 0;
  const discountAllocated = round2(Number(sale.discount_amount) * share);
  const taxAllocated = round2(Number(sale.tax_amount) * share);
  const refundableTotal = round2(Number(line.net_amount) - discountAllocated + taxAllocated);
  const qty = Number(line.quantity);
  return {
    perUnitPrice: line.unit_price,
    perUnitDiscount: qty > 0 ? discountAllocated / qty : 0,
    perUnitTax: qty > 0 ? taxAllocated / qty : 0,
    perUnitRefund: qty > 0 ? refundableTotal / qty : 0,
    lineDiscountAllocated: discountAllocated,
    lineTaxAllocated: taxAllocated,
    lineRefundableTotal: refundableTotal,
  };
}

/** originalQty - Σ(quantity from POSTED return lines against this sale line). */
async function returnedQtyForSaleLine(db, saleLineId) {
  const row = await db.get(
    `SELECT COALESCE(SUM(rl.quantity), 0) AS total
       FROM retail_return_lines rl
       JOIN retail_returns r ON r.id = rl.retail_return_id
      WHERE rl.original_sale_line_id = ? AND r.status = 'POSTED'`,
    [saleLineId]
  );
  return Number(row?.total || 0);
}

/** Σ(quantity from POSTED return lines attributed to this specific batch, for this sale line). */
async function returnedQtyForBatch(db, saleLineId, batchId) {
  const row = await db.get(
    `SELECT COALESCE(SUM(rlb.quantity), 0) AS total
       FROM retail_return_line_batches rlb
       JOIN retail_return_lines rl ON rl.id = rlb.retail_return_line_id
       JOIN retail_returns r ON r.id = rl.retail_return_id
      WHERE rl.original_sale_line_id = ? AND rlb.batch_id = ? AND r.status = 'POSTED'`,
    [saleLineId, batchId]
  );
  return Number(row?.total || 0);
}

/** Everything a return UI needs: per line, what's left to return and at what historical basis. */
export async function getReturnableLines(db, saleId) {
  await ensureRetailReturnsSchema(db);
  const sale = await db.get(
    `SELECT s.*, c.name AS customer_name FROM retail_sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`,
    [saleId]
  );
  if (!sale) throw bad('Sale not found.', 404);
  if (sale.status !== 'COMPLETED') throw bad('Only a completed sale can be returned.', 409);

  const lines = await db.all(`SELECT * FROM retail_sale_lines WHERE retail_sale_id = ? ORDER BY id`, [saleId]);
  const out = [];
  for (const line of lines) {
    const returnedQty = await returnedQtyForSaleLine(db, line.id);
    const batches = await db.all(
      `SELECT sb.batch_id, sb.quantity, ib.batch_number, ib.expiry_date, ib.status
         FROM retail_sale_line_batches sb JOIN inventory_batches ib ON ib.id = sb.batch_id
        WHERE sb.retail_sale_line_id = ?`,
      [line.id]
    );
    const batchesWithRemaining = [];
    for (const b of batches) {
      const returnedForBatch = await returnedQtyForBatch(db, line.id, b.batch_id);
      batchesWithRemaining.push({ ...b, returnableQuantity: round2(Number(b.quantity) - returnedForBatch) });
    }
    out.push({
      ...line,
      returnedQuantity: returnedQty,
      returnableQuantity: round2(Number(line.quantity) - returnedQty),
      allocation: lineAllocation(sale, line),
      batches: batchesWithRemaining,
    });
  }
  return { sale, lines: out };
}

function computeReturnLine(l) {
  const quantity = Number(l.quantity);
  if (!(quantity > 0)) throw bad('Each return line needs a positive quantity.');
  const condition = String(l.condition || '').toUpperCase();
  const disposition = String(l.disposition || '').toUpperCase();
  if (!CONDITIONS.includes(condition)) throw bad(`Unknown condition "${condition}".`);
  if (!DISPOSITIONS.includes(disposition)) throw bad(`Unknown disposition "${disposition}".`);
  return {
    original_sale_line_id: Number(l.original_sale_line_id ?? l.originalSaleLineId),
    quantity,
    condition,
    disposition,
    batch_id: l.batch_id ?? l.batchId ?? null,
    reason: l.reason || null,
    notes: l.notes || null,
  };
}

export async function createReturn(db, data) {
  const lines = (data.lines || []).map(computeReturnLine);
  if (!lines.length) throw bad('Add at least one return line.');
  if ((data.without_receipt || data.withoutReceipt) && !String(data.reason || '').trim()) {
    throw bad('A reason is required when the customer cannot provide the receipt.');
  }
  await ensureRetailReturnsSchema(db);

  const { sale, lines: returnable } = await getReturnableLines(db, data.original_sale_id ?? data.originalSaleId);
  const byLineId = new Map(returnable.map((l) => [l.id, l]));

  return db.transaction(async (tx) => {
    const returnNumber = data.return_number || await nextDocumentNumber(tx, { type: 'retail_return', prefix: 'CN' });
    const result = await tx.run(
      `INSERT INTO retail_returns
         (return_number, original_sale_id, customer_id, cashier_id, status, reason, notes, without_receipt)
       VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
      [returnNumber, sale.id, data.customer_id ?? data.customerId ?? sale.customer_id ?? null,
        data.cashier_id ?? data.cashierId ?? null, data.reason || null, data.notes || null,
        data.without_receipt || data.withoutReceipt ? 1 : 0]
    );
    const returnId = result.lastInsertRowid;

    for (const l of lines) {
      const original = byLineId.get(l.original_sale_line_id);
      if (!original) throw bad(`Sale line ${l.original_sale_line_id} does not belong to this sale.`);
      if (l.quantity > original.returnableQuantity + 0.0005) {
        throw bad(`Cannot return ${l.quantity} of "${original.product_name_snapshot}" — only ${original.returnableQuantity} remains returnable.`, 409);
      }
      const alloc = original.allocation;
      const refundAmount = round2(alloc.perUnitRefund * l.quantity);
      const discountAllocated = round2(alloc.perUnitDiscount * l.quantity);
      const taxAllocated = round2(alloc.perUnitTax * l.quantity);

      const lineResult = await tx.run(
        `INSERT INTO retail_return_lines
           (retail_return_id, original_sale_line_id, variant_id, quantity, unit_price, discount_allocated,
            tax_allocated, refund_amount, unit_cogs, condition, disposition, batch_id, reason, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [returnId, l.original_sale_line_id, original.variant_id, l.quantity, alloc.perUnitPrice,
          discountAllocated, taxAllocated, refundAmount, original.unit_cost, l.condition, l.disposition,
          l.batch_id, l.reason, l.notes]
      );
      const returnLineId = lineResult.lastInsertRowid;

      // Batch attribution: default to the sale line's single original batch;
      // otherwise the caller must name one of the original allocations.
      if (original.batches.length && l.disposition !== 'NO_STOCK_RETURN') {
        let batchId = l.batch_id;
        if (!batchId && original.batches.length === 1) batchId = original.batches[0].batch_id;
        if (!batchId) throw bad(`"${original.product_name_snapshot}" was sold from multiple batches — choose which one this return came from.`);
        const originalBatch = original.batches.find((b) => b.batch_id === batchId);
        if (!originalBatch) throw bad('That batch was not part of the original sale — cannot return it to a batch it never came from.', 400);
        if (l.quantity > originalBatch.returnableQuantity + 0.0005) {
          throw bad(`Only ${originalBatch.returnableQuantity} of batch ${originalBatch.batch_number} remains returnable from this sale.`, 409);
        }
        await tx.run(`UPDATE retail_return_lines SET batch_id = ? WHERE id = ?`, [batchId, returnLineId]);
        await tx.run(
          `INSERT INTO retail_return_line_batches (retail_return_line_id, batch_id, quantity) VALUES (?, ?, ?)`,
          [returnLineId, batchId, l.quantity]
        );
      }
    }
    return getReturn(tx, returnId);
  });
}

export async function getReturn(db, id) {
  const ret = await db.get(`SELECT * FROM retail_returns WHERE id = ?`, [id]);
  if (!ret) return null;
  const lines = await db.all(
    `SELECT rl.*, v.variant_name, sl.product_name_snapshot, sl.variant_name_snapshot
       FROM retail_return_lines rl
       JOIN product_variants v ON v.id = rl.variant_id
       JOIN retail_sale_lines sl ON sl.id = rl.original_sale_line_id
      WHERE rl.retail_return_id = ? ORDER BY rl.id`,
    [id]
  );
  return { ...ret, lines };
}

export async function listReturnsForSale(db, saleId) {
  await ensureRetailReturnsSchema(db);
  return db.all(`SELECT * FROM retail_returns WHERE original_sale_id = ? ORDER BY id DESC`, [saleId]);
}

/** Posted returns across all sales, newest first — backs the returns report. */
export async function listRecentReturns(db, { limit = 200 } = {}) {
  await ensureRetailReturnsSchema(db);
  return db.all(
    `SELECT r.*, s.sale_number, c.name AS customer_name
       FROM retail_returns r
       JOIN retail_sales s ON s.id = r.original_sale_id
       LEFT JOIN customers c ON c.id = r.customer_id
      WHERE r.status = 'POSTED'
      ORDER BY r.id DESC LIMIT ?`,
    [Math.min(500, Math.max(1, Number(limit) || 200))]
  );
}

/**
 * Post a DRAFT return — atomic. Re-validates returnable quantity/batch
 * allocation against POSTED returns only (inside this transaction, so a
 * concurrent post on the same sale line serializes correctly), applies the
 * disposition's inventory/accounting effect per line, then posts ONE
 * balanced journal for the whole return. Idempotent by return id (already-
 * POSTED replays return the existing row) and by idempotencyKey.
 */
export async function postReturn(db, id, opts = {}) {
  await ensureAfterSalesSchema(db);
  const {
    postedBy = null, businessDayId = null, refundMethod, allowNonResellable = false, idempotencyKey = null,
  } = opts;
  await ensureRetailReturnsSchema(db);

  if (idempotencyKey) {
    const existing = await db.get(`SELECT id FROM retail_returns WHERE idempotency_key = ? AND status = 'POSTED'`, [idempotencyKey]);
    if (existing) return getReturn(db, existing.id);
  }

  return db.transaction(async (tx) => {
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    const ret = await tx.get(`SELECT * FROM retail_returns WHERE id = ?${lock}`, [id]);
    if (!ret) throw bad('Return not found.', 404);
    if (ret.status === 'POSTED') return getReturn(tx, id); // idempotent replay
    if (ret.status !== 'DRAFT') throw bad(`Cannot post a return in status ${ret.status}.`, 409);

    const sale = await tx.get(`SELECT * FROM retail_sales WHERE id = ?${lock}`, [ret.original_sale_id]);
    if (!sale) throw bad('Original sale not found.', 404);

    const lines = await tx.all(`SELECT * FROM retail_return_lines WHERE retail_return_id = ? ORDER BY id`, [id]);
    if (!lines.length) throw bad('This return has no lines.', 409);

    const today = new Date().toISOString().slice(0, 10);
    const businessDay = businessDayId || await currentBusinessDayId(tx, { required: true });
    const defaultLocation = await getDefaultLocation(tx);
    const quarantineLocation = await getQuarantineLocation(tx);

    // The original sale journal (lib/retail-sales.js: postRetailSaleJournal)
    // credits 4010 NET of discount already — discount is never its own line,
    // just netted into the amount. So reversing it means debiting 4011 for
    // that same net-of-discount, pre-tax figure: refund_amount - tax_allocated
    // (refund_amount = net_amount - discount_allocated + tax_allocated already).
    let revenueReversal = 0;
    let taxReversal = 0;
    let cogsReversalTotal = 0; // Dr 1210 / Cr 5080, applies to every physically-received disposition
    let writeOffLossTotal = 0; // Dr 5040 / Cr 1210, applies only to WRITE_OFF's second leg

    for (const line of lines) {
      // Re-validate INSIDE the transaction — the authoritative check, not the create-time one.
      const earlierLines = await tx.get(`SELECT COALESCE(SUM(quantity),0) AS quantity FROM retail_return_lines
        WHERE retail_return_id=? AND original_sale_line_id=? AND id<?`, [id, line.original_sale_line_id, line.id]);
      const returnedSoFar = await returnedQtyForSaleLine(tx, line.original_sale_line_id) + Number(earlierLines.quantity);
      // Locked (Postgres) so a concurrent postReturn() against the SAME sale
      // line — from a different DRAFT return — serializes here rather than
      // both independently computing "1 left" and both succeeding.
      const originalLine = await tx.get(`SELECT * FROM retail_sale_lines WHERE id = ?${lock}`, [line.original_sale_line_id]);
      const warrantyReserved = await tx.get(`SELECT COALESCE(SUM(quantity),0) AS quantity FROM warranty_claims WHERE sale_line_id=? AND id<>? AND ((status NOT IN ('CLOSED','CANCELLED') AND COALESCE(resolution,'') NOT IN ('REFUNDED','STORE_CREDIT')) OR resolution IN ('REPLACED','SUPPLIER_REPLACED'))`, [line.original_sale_line_id, opts.warrantyClaimId || -1]);
      if (Number(line.quantity) + returnedSoFar + Number(warrantyReserved.quantity) > Number(originalLine.quantity)) throw bad('This purchase has an active or replaced warranty claim. Resolve it through After-Sales.',409);
      const returnable = round2(Number(originalLine.quantity) - returnedSoFar);
      if (Number(line.quantity) > returnable + 0.0005) {
        throw bad(`Over-return: only ${returnable} of "${originalLine.product_name_snapshot}" remains returnable.`, 409);
      }

      if (RISKY_CONDITIONS.has(line.condition) && line.disposition === 'RETURN_TO_SELLABLE' && !allowNonResellable) {
        throw bad(`"${originalLine.product_name_snapshot}" is ${line.condition} — cannot return it to sellable stock without authorization.`, 403);
      }
      if (line.disposition === 'NO_STOCK_RETURN' && !allowNonResellable) {
        throw bad('A no-stock (pure refund) return requires manager authorization.', 403);
      }

      revenueReversal = round2(revenueReversal + Number(line.refund_amount) - Number(line.tax_allocated));
      taxReversal = round2(taxReversal + Number(line.tax_allocated));

      const previousCost = await tx.get(`SELECT COALESCE(SUM(COALESCE(rl.total_cogs,ROUND(rl.unit_cogs*rl.quantity,2))),0) AS amount
        FROM retail_return_lines rl JOIN retail_returns rr ON rr.id=rl.retail_return_id
        WHERE rl.original_sale_line_id=? AND (rr.status='POSTED' OR (rr.id=? AND rl.id<?))`, [line.original_sale_line_id, id, line.id]);
      const remainingCost = round2(Number(originalLine.total_cost || 0) - Number(previousCost.amount));
      if (remainingCost < 0) throw bad('Historical returned cost exceeds original sale cost. Review source evidence.', 409);
      const returnCost = proportionalValue(remainingCost, line.quantity, returnable, { floor: true });
      await tx.run(`UPDATE retail_return_lines SET total_cogs=? WHERE id=?`, [returnCost, line.id]);

      if (line.disposition === 'NO_STOCK_RETURN') continue;

      const targetLocation = line.disposition === 'RETURN_TO_SELLABLE' ? defaultLocation : quarantineLocation;
      const batch = line.batch_id ? await tx.get(`SELECT * FROM inventory_batches WHERE id = ?`, [line.batch_id]) : null;

      // Expired-original-batch guard (spec §15): never let it back into sellable stock.
      if (line.disposition === 'RETURN_TO_SELLABLE' && batch?.expiry_date && batch.expiry_date < today) {
        throw bad(`Batch ${batch.batch_number} has expired — cannot return it to sellable stock. Use Quarantine or Write-off.`, 409);
      }

      const variant = await tx.get(`SELECT tracking_mode FROM product_variants WHERE id = ?`, [line.variant_id]);
      let received;
      if (variant?.tracking_mode === 'serial') {
        const serialLock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
        const soldSerials = await tx.all(
          `SELECT serial_number FROM inventory_serials
            WHERE sale_line_id = ? AND status = 'SOLD' AND (?='' OR serial_number=?)
            ORDER BY id${serialLock}`,
          [line.original_sale_line_id, opts.warrantySerial || '', opts.warrantySerial || '']
        );
        const quantity = Number(line.quantity);
        if (soldSerials.length < quantity) throw bad('The sold serial identity is no longer available for this return.', 409);
        if (soldSerials.length !== quantity) {
          throw bad('A partial return of multiple serial-tracked units must identify the exact serial number.', 409);
        }
        const serialDisposition = line.disposition === 'RETURN_TO_SELLABLE'
          ? 'IN_STOCK'
          : line.disposition === 'WRITE_OFF' ? 'DAMAGED' : 'QUARANTINE';
        const serialValues = allocateValue(returnCost, soldSerials.map(() => 1));
        for (const [index, serial] of soldSerials.entries()) {
          await returnSerial(tx, {
            serialNumber: serial.serial_number,
            originalSaleLineId: line.original_sale_line_id,
            returnLineId: line.id,
            disposition: serialDisposition,
            locationId: targetLocation.id,
            unitCost: line.unit_cogs,
            totalValue: serialValues[index],
            businessDayId: businessDay,
            createdBy: postedBy,
          });
        }
      } else {
        received = await receiveStock(tx, {
          variantId: line.variant_id, locationId: targetLocation.id, quantity: line.quantity,
          unitCost: line.unit_cogs, totalValue: returnCost, movementType: 'CUSTOMER_RETURN', batchId: line.batch_id || null,
          referenceType: 'retail_return_line', referenceId: line.id,
          reason: `Return ${ret.return_number}`, businessDayId: businessDay, createdBy: postedBy,
        });
      }
      cogsReversalTotal = round2(cogsReversalTotal + returnCost);

      if (line.disposition === 'WRITE_OFF') {
        const [applied] = await issueStock(tx, {
          variantId: line.variant_id, locationId: targetLocation.id, quantity: line.quantity,
          movementType: 'DAMAGE', batchId: line.batch_id || null,
          referenceType: 'retail_return_line_writeoff', referenceId: line.id,
          reason: `Write-off — return ${ret.return_number}`, businessDayId: businessDay, createdBy: postedBy,
        });
        writeOffLossTotal = round2(writeOffLossTotal + Math.abs(Number(applied.movement.total_cost || 0)));
      }
      void received;
    }

    const totalRefund = round2(revenueReversal + taxReversal);

    // Refund settlement — explicit choice, validated against what's actually available.
    const method = String(refundMethod || '').toLowerCase();
    let creditCode;
    let storeCreditIssued = 0;
    if (method === 'store_credit') {
      if (!ret.customer_id) throw bad('Store credit requires an identified customer.', 400);
      creditCode = '2030';
      storeCreditIssued = totalRefund;
    } else if (method === 'ar_reduction') {
      if (!ret.customer_id) throw bad('AR reduction requires an identified customer.', 400);
      const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
      const creditSale = await tx.get(`SELECT amount_due FROM retail_sales WHERE id = ?${lock}`, [sale.id]);
      if (totalRefund > Number(creditSale?.amount_due || 0) + 0.005) {
        throw bad(`Only ${round2(creditSale?.amount_due)} remains on customer credit; choose another refund method for the excess.`, 409);
      }
      creditCode = '1300';
    } else {
      creditCode = paymentAccountCode(method); // cash->1010, online->1020; throws on unknown
      if (creditCode === '1010' || creditCode === '1020') {
        const available = round2(await accountBalance(tx, creditCode, creditCode === '1010' ? { drawerId: await currentDrawerId(tx) } : {}));
        if (totalRefund > available + 0.01) {
          throw bad(`Not enough ${method} available to refund (have ${available}).`, 409);
        }
      }
    }

    const drawerId = creditCode === '1010' ? await currentDrawerId(tx) : null;
    const bankAccountId = creditCode === '1020' ? await primaryBankAccountId(tx) : null;

    const journalLines = [
      { code: '4011', debit: revenueReversal, credit: 0, memo: 'Sales returns' },
    ];
    if (taxReversal > 0.005) journalLines.push({ code: '2020', debit: taxReversal, credit: 0, memo: 'Output VAT reversed' });
    journalLines.push({
      code: creditCode, debit: 0, credit: totalRefund,
      drawer_id: drawerId, bank_account_id: bankAccountId, customer_id: ['1300', '2030'].includes(creditCode) ? ret.customer_id : null,
      memo: method === 'store_credit' ? 'Store credit issued' : method === 'ar_reduction' ? 'AR reduced' : `Refunded ${method}`,
    });
    if (cogsReversalTotal > 0.005) {
      journalLines.push({ code: '1210', debit: cogsReversalTotal, credit: 0, memo: 'Retail inventory restored' });
      journalLines.push({ code: '5080', debit: 0, credit: cogsReversalTotal, memo: 'COGS reversed' });
    }
    if (writeOffLossTotal > 0.005) {
      journalLines.push({ code: '5040', debit: writeOffLossTotal, credit: 0, memo: 'Returns write-off' });
      journalLines.push({ code: '1210', debit: 0, credit: writeOffLossTotal, memo: 'Inventory removed — written off' });
    }

    await postJournal(tx, {
      entry_date: today,
      memo: `Customer return ${ret.return_number} — sale ${sale.sale_number}`,
      source_type: 'retail_return',
      source_id: ret.id,
      created_by: postedBy,
      business_day_id: businessDay,
      lines: journalLines,
    });

    if (method === 'ar_reduction') {
      await tx.run(`UPDATE retail_sales SET amount_due = amount_due - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [totalRefund, sale.id]);
    }

    if (method === 'store_credit') {
      await issueStoreCredit(tx, {
        customerId: ret.customer_id, amount: totalRefund, sourceType: 'retail_return', sourceId: ret.id,
        reason: `Return ${ret.return_number}`, createdBy: postedBy, skipJournal: true,
        // The Cr 2030 leg is already in the journal above — issueStoreCredit's own
        // journal posting is skipped so store credit isn't double-posted to the GL.
      });
    }

    // Reverse the proportionate share of loyalty points earned on the
    // original sale — see lib/retail-loyalty.js's file header. No-op if the
    // sale had no customer or earned no points.
    if (ret.customer_id) {
      await reversePointsForReturn(tx, {
        customerId: ret.customer_id, originalSaleId: sale.id, originalSubtotal: Number(sale.subtotal),
        refundAmount: revenueReversal, createdBy: postedBy,
      });
    }

    await tx.run(
      `UPDATE retail_returns
       SET status = 'POSTED', refund_method = ?, refund_total = ?, tax_reversal_total = ?,
           store_credit_issued = ?, business_day_id = ?, idempotency_key = ?, posted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [method, totalRefund, taxReversal, storeCreditIssued, businessDay, idempotencyKey, id]
    );

    return getReturn(tx, id);
  });
}
