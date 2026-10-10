/**
 * Retail sales: Barcode/Cart -> Held Sale -> Checkout -> Inventory deduction
 * (FEFO where batch-tracked) -> moving-average COGS -> accounting -> business
 * day -> receipt.
 *
 * ── STOCK SOURCE OF TRUTH ──────────────────────────────────────────────────
 * checkoutSale() calls lib/retail-inventory.js's issueStock() exclusively.
 *
 * ── ACCOUNTING ─────────────────────────────────────────────────────────────
 * One balanced journal per completed sale (source_type='retail_sale'):
 * Dr Cash/Bank/AR, Cr Sales Revenue, Cr VAT, plus Dr COGS(5080) / Cr Retail Inventory(1210)
 * for the cost side, in the SAME journal — COGS uses the moving-average cost
 * postMovement() already stamped on each SALE inventory_movement, never the
 * batch's original receipt cost and never the selling price.
 *
 * ── HOLD / RESUME ──────────────────────────────────────────────────────────
 * A HELD retail_sales row *is* the cart — no inventory or accounting effect
 * exists until checkoutSale() runs. It does not reserve stock (documented,
 * not pretended): two cashiers can both hold a cart against the last unit;
 * whichever completes checkout first gets it, the second's checkout rejects
 * on insufficient stock exactly like any other oversell attempt.
 */

import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import { ensureRetailInventorySchema, issueStock, getDefaultLocation, getSellableStockBulk } from '@/lib/retail-inventory.js';
import { postJournal, paymentAccountCode, currentDrawerId, primaryBankAccountId } from '@/lib/accounting.js';
import { snapshotSaleWarranty } from '@/lib/retail-warranty.js';
import { calculateBillTotals, parseSettingsRates } from '@/lib/billing-totals.js';
import { validateAllocations, fromCents } from '@/lib/payment-allocations.js';
import { ensureDocumentNumberSchema, nextDocumentNumber } from '@/lib/document-numbers.js';
import { currentBusinessDayId } from '@/lib/business-days.js';
import { buildSearch, paginateQuery, resolveOrderBy } from '@/lib/paginate.js';
import { redeemStoreCredit } from '@/lib/retail-store-credit.js';
import { evaluateRetailPromotions, recordRetailPromotionRedemptions } from '@/lib/retail-promotions.js';
import { quoteRedemption, redeemPoints, earnPointsForSale } from '@/lib/retail-loyalty.js';
import { resolveRetailPrices, priceRetailLines } from '@/lib/retail-pricing.js';
import { checkRetailMargins } from '@/lib/retail-margin-policy.js';
import { allocateSerialsForSale } from '@/lib/retail-serials.js';
import { lockRetailStock } from '@/lib/retail-stock-lock.js';
import { getAvailableToSell } from '@/lib/retail-reservations.js';
import { ensureColumn } from '@/lib/db/schema-helpers.js';
import { findByBarcode } from '@/lib/product-catalog.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

let ENSURED = false;

export async function ensureRetailSalesSchema(db) {
  await ensureRetailInventorySchema(db);
  await ensureDocumentNumberSchema(db);

  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_number TEXT UNIQUE,
    location_id INTEGER REFERENCES inventory_locations(id),
    customer_id INTEGER,
    cashier_id INTEGER,
    business_day_id INTEGER,
    status TEXT NOT NULL DEFAULT 'HELD',
    subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount_reason TEXT,
    tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    grand_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0,
    amount_due NUMERIC(14,2) NOT NULL DEFAULT 0,
    cogs_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes TEXT,
    idempotency_key TEXT UNIQUE,
    held_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_sale_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retail_sale_id INTEGER NOT NULL REFERENCES retail_sales(id) ON DELETE CASCADE,
    variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    sku_snapshot TEXT,
    product_name_snapshot TEXT NOT NULL,
    variant_name_snapshot TEXT,
    quantity NUMERIC(14,3) NOT NULL,
    unit_price NUMERIC(14,2) NOT NULL,
    list_price NUMERIC(14,2),
    discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    unit_cost NUMERIC(14,4),
    total_cost NUMERIC(14,2),
    notes TEXT
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_sale_line_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retail_sale_line_id INTEGER NOT NULL REFERENCES retail_sale_lines(id) ON DELETE CASCADE,
    batch_id INTEGER NOT NULL REFERENCES inventory_batches(id),
    quantity NUMERIC(14,3) NOT NULL
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_sale_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retail_sale_id INTEGER NOT NULL REFERENCES retail_sales(id) ON DELETE CASCADE,
    method TEXT NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    cash_tendered NUMERIC(14,2),
    change_given NUMERIC(14,2),
    reference TEXT,
    provider TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_credit_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,retail_sale_id INTEGER NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL,credit_amount NUMERIC(14,2) NOT NULL,
    exposure_before NUMERIC(14,2) NOT NULL,credit_limit NUMERIC(14,2) NOT NULL,
    reason TEXT NOT NULL,approved_by INTEGER NOT NULL,
    approved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await ensureSqliteTable(db, `CREATE TABLE IF NOT EXISTS retail_sale_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    retail_sale_id INTEGER NOT NULL REFERENCES retail_sales(id),
    event TEXT NOT NULL,
    actor_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await ensureColumn(db,'retail_sales','channel',"TEXT NOT NULL DEFAULT 'retail_pos'");
  await ensureColumn(db,'retail_sales','delivery_charge','NUMERIC(14,2) NOT NULL DEFAULT 0');
  await ensureColumn(db, 'retail_sale_lines', 'serial_numbers_json', 'TEXT');
  ENSURED = true;
}

async function loadVariants(db, variantIds) {
  const rows = await db.all(
    `SELECT v.*, mi.name AS product_name, mi.id AS product_id
     FROM product_variants v JOIN products mi ON mi.id = v.product_id
     WHERE v.id IN (${variantIds.map(()=>'?').join(',')})`,
    variantIds
  );
  return new Map(rows.map(row=>[Number(row.id),row]));
}

/** Canonical price a line should sell at, ignoring any client-supplied price unless explicitly authorized. */
function resolveLinePrice(variant, requested, allowOverride) {
  const canonical = Number(variant.price ?? 0);
  if (allowOverride && requested != null && Number.isFinite(Number(requested)) && Number(requested) >= 0) {
    return { unitPrice: round2(Number(requested)), listPrice: canonical, overridden: round2(Number(requested)) !== canonical };
  }
  return { unitPrice: canonical, listPrice: canonical, overridden: false };
}

function computeLine({ variant, quantity, unitPrice, discountAmount = 0 }) {
  const qty = Number(quantity);
  if (!(qty > 0)) throw bad('Line quantity must be positive.');
  const discount = Math.max(0, Number(discountAmount) || 0);
  const gross = round2(unitPrice * qty);
  const net = round2(Math.max(0, gross - discount));
  return {
    variant_id: variant.id,
    sku_snapshot: variant.sku || null,
    product_name_snapshot: variant.product_name,
    variant_name_snapshot: variant.variant_name,
    quantity: qty,
    unit_price: unitPrice,
    list_price: variant.price != null ? Number(variant.price) : null,
    discount_amount: discount,
    net_amount: net,
  };
}

/**
 * Build (or replace) a HELD sale's lines. Server always reloads each
 * variant's canonical price; a client-requested price is honored only when
 * `allowPriceOverride` is true (the API route gates that on
 * retail_sale.price_override before calling this).
 */
async function buildLines(db, rawLines, { allowPriceOverride = false, customerId = null, channel = 'retail_pos', at = new Date(),resolvedPrices=null } = {}) {
  const lines = [];
  const prices = new Map((resolvedPrices||await resolveRetailPrices(db, rawLines, { customerId, channel, at })).map(price=>[price.variant_id,price]));
  const variants=await loadVariants(db,[...prices.keys()]);
  for (const l of rawLines || []) {
    const variantId = Number(l.variant_id ?? l.variantId);
    if (!variantId) throw bad('Every line needs a variant.');
    const variant = variants.get(variantId);
    if(!variant)throw bad(`Variant ${variantId} not found.`,404);
    const resolution=prices.get(variantId);
    const { unitPrice, listPrice } = resolveLinePrice({ ...variant, price: resolution.unit_price }, l.unit_price ?? l.unitPrice, allowPriceOverride && l.price_overridden !== false);
    const line = computeLine({
      variant: { ...variant, price: listPrice },
      quantity: l.quantity,
      unitPrice,
      discountAmount: l.discount_amount ?? l.discountAmount ?? 0,
    });
    line.serial_numbers = [...new Set((l.serialNumbers || l.serial_numbers || []).map((s) => String(s).trim()).filter(Boolean))];
    line.price_resolution = { ...resolution,unit_price:unitPrice,reason:unitPrice!==resolution.unit_price?'Authorized price override':resolution.reason };
    lines.push(line);
  }
  if (!lines.length) throw bad('A sale needs at least one line.');
  return lines;
}

async function replaceLines(db, saleId, lines) {
  await db.run(`DELETE FROM retail_sale_lines WHERE retail_sale_id = ?`, [saleId]);
  for (const l of lines) {
    await db.run(
      `INSERT INTO retail_sale_lines
         (retail_sale_id, variant_id, sku_snapshot, product_name_snapshot, variant_name_snapshot,
          quantity, unit_price, list_price, discount_amount, net_amount, serial_numbers_json,price_explanation_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)`,
      [saleId, l.variant_id, l.sku_snapshot, l.product_name_snapshot, l.variant_name_snapshot,
        l.quantity, l.unit_price, l.list_price, l.discount_amount, l.net_amount, JSON.stringify(l.serial_numbers || []),JSON.stringify(l.price_resolution)]
    );
  }
}

function sumHeaderTotals(lines, { discountAmount = 0, vatPercent = 0, deliveryFee = 0 } = {}) {
  const subtotal = round2(lines.reduce((s, l) => s + l.net_amount, 0));
  const totals = calculateBillTotals(subtotal, { discountAmount, vatPercent, deliveryFee });
  return { subtotal, discount: totals.discount, tax: round2(totals.tax), total: round2(totals.total), delivery_charge: round2(deliveryFee) };
}

async function getVatPercent(db) {
  const rows = await db.all(`SELECT setting_key, setting_value FROM system_settings`);
  const settings = {};
  for (const r of rows || []) settings[r.setting_key] = r.setting_value;
  return parseSettingsRates(settings).vatPercent;
}

/** Read-only quote uses the same promotion, price, loyalty and tax functions as posting. */
export async function quoteRetailSale(db, data, { allowDiscount = false, allowPriceOverride = false, channel = 'retail_pos', deliveryFee = 0 } = {}) {
  await ensureRetailSalesSchema(db);
  const priceContext={customerId:data.customer_id,channel,at:new Date(),allowPriceOverride};
  const pricedLines=await priceRetailLines(db,data.lines,priceContext);
  const promotion = await evaluateRetailPromotions(db, { channel, lines: pricedLines, couponCode: data.coupon_code, customerId: data.customer_id, allowBelowCost: allowPriceOverride });
  const lines = await buildLines(db, (data.lines || []).map((line, i) => ({ ...line, discount_amount: (promotion.lineDiscounts.get(i) ?? 0) + (allowDiscount ? Math.max(0, Number(line.manual_discount_amount) || 0) : 0) })), { allowPriceOverride,...priceContext,resolvedPrices:pricedLines.map(line=>line.price_resolution) });
  const vatPercent = await getVatPercent(db);
  const discount = allowDiscount ? Number(data.discount_amount || 0) : 0;
  const before = sumHeaderTotals(lines, { discountAmount: discount, vatPercent });
  const redemption = data.redeem_loyalty_points > 0
    ? await quoteRedemption(db, { customerId: data.customer_id, points: data.redeem_loyalty_points, saleTotal: before.total }) : { points: 0, value: 0 };
  const location = await getDefaultLocation(db);
  const stock = await getSellableStockBulk(db, lines.map((line) => line.variant_id), { locationId: location?.id });
  const quantities = new Map();
  for (const line of lines) quantities.set(line.variant_id, (quantities.get(line.variant_id) || 0) + Number(line.quantity));
  const conflicts = [];
  const stock_conflicts = [];
  for (const [variantId, quantity] of quantities) if (quantity > Number(stock[variantId] || 0)) {
    const available = Number(stock[variantId] || 0);
    const line = lines.find((item) => Number(item.variant_id) === Number(variantId));
    stock_conflicts.push({ variant_id: variantId, product_name: line?.product_name_snapshot, variant_name: line?.variant_name_snapshot, sku: line?.sku_snapshot, requested: quantity, available });
    conflicts.push(`${line?.product_name_snapshot || 'Product'}${line?.variant_name_snapshot ? ` · ${line.variant_name_snapshot}` : ''}: ${quantity} requested, ${available} available at this location.`);
  }
  const serials = lines.flatMap((line) => line.serial_numbers || []);
  if (new Set(serials).size !== serials.length) conflicts.push('A serial number is selected more than once.');
  if (serials.length) {
    const available = await db.all(`SELECT serial_number,variant_id FROM inventory_serials WHERE status='IN_STOCK' AND location_id=? AND serial_number IN (${serials.map(() => '?').join(',')})`, [location?.id, ...serials]);
    for (const line of lines) for (const serial of line.serial_numbers || []) if (!available.some((s) => s.serial_number === serial && Number(s.variant_id) === Number(line.variant_id))) conflicts.push(`Serial ${serial} is no longer available. Select a replacement.`);
  }
  return { ...sumHeaderTotals(lines, { discountAmount: round2(discount + redemption.value), vatPercent, deliveryFee }), conflicts, stock_conflicts,
    promoDiscount: round2([...promotion.lineDiscounts.values()].reduce((sum, amount) => sum + Number(amount || 0), 0)),
    lineDiscount: allowDiscount ? round2((data.lines || []).reduce((sum, line) => sum + Math.max(0, Number(line.manual_discount_amount) || 0), 0)) : 0,
    loyaltyDiscount: redemption.value,
    margin_warnings: await checkRetailMargins(db,lines,{discount:round2(discount+redemption.value),managerAuthorized:allowPriceOverride}),
    line_totals: lines.map(line=>({variant_id:line.variant_id,quantity:line.quantity,discount_amount:line.discount_amount,net_amount:line.net_amount})),
    pricing: lines.map(line=>line.price_resolution),applied_promotions: promotion.appliedPromotions };
}

/** Create a HELD sale — the cart. No inventory or accounting effect. */
export async function holdSale(db, data) {
  await ensureRetailSalesSchema(db);
  const lines = await buildLines(db, data.lines, { allowPriceOverride: Boolean(data.allowPriceOverride),customerId:data.customer_id??data.customerId,channel:data.channel||'retail_pos' });
  const locationId = data.location_id || data.locationId || (await getDefaultLocation(db))?.id;

  return db.transaction(async (tx) => {
    const result = await tx.run(
      `INSERT INTO retail_sales (location_id, customer_id, cashier_id, status, notes)
       VALUES (?, ?, ?, 'HELD', ?)`,
      [locationId, data.customer_id ?? data.customerId ?? null, data.cashier_id ?? data.cashierId ?? null, data.notes || null]
    );
    const saleId = result.lastInsertRowid;
    await replaceLines(tx, saleId, lines);
    const vatPercent = await getVatPercent(tx);
    const totals = sumHeaderTotals(lines, { discountAmount: data.discount_amount ?? data.discountAmount ?? 0, vatPercent });
    await tx.run(
      `UPDATE retail_sales SET subtotal = ?, discount_amount = ?, tax_amount = ?, grand_total = ?, amount_due = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [totals.subtotal, totals.discount, totals.tax, totals.total, totals.total, saleId]
    );
    return getRetailSale(tx, saleId);
  });
}

/** Replace a HELD sale's lines/discount — still HELD, still no side effects. */
export async function updateHeldSale(db, id, data) {
  await ensureRetailSalesSchema(db);
  return db.transaction(async (tx) => {
    const sale = await tx.get(`SELECT * FROM retail_sales WHERE id = ?`, [id]);
    if (!sale) throw bad('Sale not found.', 404);
    if (sale.status !== 'HELD') throw bad(`Cannot edit a sale in status ${sale.status}.`, 409);

    const lines = await buildLines(tx, data.lines, { allowPriceOverride: Boolean(data.allowPriceOverride),customerId:data.customer_id??data.customerId??sale.customer_id });
    await replaceLines(tx, id, lines);
    const vatPercent = await getVatPercent(tx);
    const totals = sumHeaderTotals(lines, { discountAmount: data.discount_amount ?? data.discountAmount ?? sale.discount_amount, vatPercent });
    await tx.run(
      `UPDATE retail_sales
       SET customer_id = ?, notes = ?, subtotal = ?, discount_amount = ?, tax_amount = ?, grand_total = ?, amount_due = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [data.customer_id ?? data.customerId ?? sale.customer_id, data.notes ?? sale.notes,
        totals.subtotal, totals.discount, totals.tax, totals.total, totals.total, id]
    );
    return getRetailSale(tx, id);
  });
}

/** HELD -> CANCELLED. Nothing to reverse — a HELD sale never posted anything. */
export async function cancelHeldSale(db, id) {
  await ensureRetailSalesSchema(db);
  return db.transaction(async (tx) => {
    const sale = await tx.get(`SELECT * FROM retail_sales WHERE id = ?`, [id]);
    if (!sale) throw bad('Sale not found.', 404);
    if (sale.status !== 'HELD') throw bad(`Cannot cancel a sale in status ${sale.status}.`, 409);
    await tx.run(`UPDATE retail_sales SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
    return getRetailSale(tx, id);
  });
}

export async function listHeldSales(db, { cashierId = null, page = 1, pageSize = 40 } = {}) {
  await ensureRetailSalesSchema(db);
  return db.all(
    `SELECT s.*, c.name AS customer_name, u.full_name AS cashier_name,
      (SELECT SUM(quantity) FROM retail_sale_lines l WHERE l.retail_sale_id=s.id) AS item_count
      FROM retail_sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN users u ON u.id=s.cashier_id
      WHERE s.status = 'HELD' ${cashierId ? 'AND s.cashier_id = ?' : ''} ORDER BY s.held_at DESC,s.id DESC LIMIT ? OFFSET ?`,
    [...(cashierId ? [cashierId] : []), Math.min(100, Math.max(1, Number(pageSize) || 40)), (Math.max(1, Number(page) || 1) - 1) * Math.min(100, Math.max(1, Number(pageSize) || 40))]
  );
}

export async function getRetailSale(db, id) {
  await ensureRetailSalesSchema(db);
  const sale = await db.get(
    `SELECT s.*, u.full_name AS cashier_name, c.name AS customer_name, c.phone AS customer_phone
     FROM retail_sales s
     LEFT JOIN users u ON u.id = s.cashier_id
     LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.id = ?`,
    [id]
  );
  if (!sale) return null;
    const lines = await db.all(`SELECT * FROM retail_sale_lines WHERE retail_sale_id = ? ORDER BY id`, [id]);
    const batches = await db.all(`SELECT b.* FROM retail_sale_line_batches b JOIN retail_sale_lines l ON l.id=b.retail_sale_line_id WHERE l.retail_sale_id=? ORDER BY b.id`, [id]);
  for (const line of lines) {
    try { line.serial_numbers = JSON.parse(line.serial_numbers_json || '[]'); } catch { line.serial_numbers = []; }
      line.batches = batches.filter((batch) => Number(batch.retail_sale_line_id) === Number(line.id));
  }
  const payments = await db.all(`SELECT * FROM retail_sale_payments WHERE retail_sale_id = ? ORDER BY id`, [id]);
  const creditOverride = await db.get(`SELECT o.credit_amount,o.exposure_before,o.credit_limit,o.reason,o.approved_at,
    u.full_name AS approved_by_name FROM retail_credit_overrides o LEFT JOIN users u ON u.id=o.approved_by
    WHERE o.retail_sale_id=?`, [id]);
  return { ...sale, lines, payments, credit_override: creditOverride || null };
}

/**
 * One balanced journal for a completed sale: Dr each payment account (Cash
 * tagged to the drawer, Bank for every digital method — this app already
 * consolidated card/QR/eSewa/Khalti/Fonepay onto the Primary Bank asset, see
 * lib/accounting.js's consolidateOnlineToPrimaryBank — Accounts Receivable
 * for credit), Cr Sales Revenue, Cr VAT; then Dr COGS / Cr Retail Inventory
 * for the cost side. source_type='retail_sale' (not 'bill').
 */
async function postRetailSaleJournal(db, { saleId, entryDate, businessDayId, createdBy, payments, storeCreditAmount = 0, taxAmount, subtotalAfterDiscount, cogsTotal, customerId }) {
  const drawerId = await currentDrawerId(db);
  const bankAccountId = await primaryBankAccountId(db);

  const lines = payments.map((p) => {
    const code = paymentAccountCode(p.method); // 'cash'->1010, 'online'->1020, 'credit'->1300 (AR)
    return {
      code,
      debit: p.amount,
      credit: 0,
      drawer_id: code === '1010' ? drawerId : null,
      bank_account_id: code === '1020' ? bankAccountId : null,
      customer_id: code === '1300' ? customerId || null : null,
      memo: `${p.method} payment`,
    };
  });

  const scAmount = round2(Math.max(0, storeCreditAmount));
  if (scAmount > 0.005) {
    lines.push({ code: '2030', debit: scAmount, credit: 0, customer_id: customerId || null, memo: 'Store credit redeemed' });
  }

  const tax = round2(Math.max(0, taxAmount));
  // subtotalAfterDiscount is already tax-EXCLUSIVE net revenue (checkoutSale
  // passes totals.subtotal - totals.discount, computed separately from tax
  // by calculateBillTotals) — do not subtract tax again here. This was a
  // real bug: dormant while every test used vatPercent=0, surfaced by
  // Phase 5's historical-tax-reversal test actually exercising VAT > 0.
  lines.push({ code: '4010', debit: 0, credit: subtotalAfterDiscount, memo: 'Retail sales revenue' });
  if (tax > 0.005) lines.push({ code: '2020', debit: 0, credit: tax, memo: 'Output VAT / tax payable' });

  if (cogsTotal > 0.005) {
    lines.push({ code: '5080', debit: cogsTotal, credit: 0, memo: 'Cost of goods sold' });
    lines.push({ code: '1210', debit: 0, credit: cogsTotal, memo: 'Retail inventory sold' });
  }

  return postJournal(db, {
    entry_date: entryDate,
    memo: `Retail sale`,
    source_type: 'retail_sale',
    source_id: saleId,
    created_by: createdBy,
    business_day_id: businessDayId,
    lines,
  });
}

/**
 * Complete a HELD sale: atomic — reloads trusted prices, validates payment
 * allocations, deducts inventory (FEFO for batch-tracked variants) at
 * moving-average COGS, posts one journal, marks COMPLETED. Idempotent via
 * idempotencyKey: a repeat with the same key returns the already-completed
 * sale rather than reprocessing.
 */
export async function checkoutSale(db, id, opts = {}) {
  const {
    payments: rawPayments = [], discountAmount, discountReason, customerId: requestedCustomerId,
    cashierId = null, allowPriceOverride = false, allowCredit = false, allowDiscount = false,
    allowCreditOverride = false, creditOverrideReason = null, idempotencyKey = null,
  } = opts;

  await ensureRetailSalesSchema(db);

  if (idempotencyKey) {
    const existing = await db.get(`SELECT id FROM retail_sales WHERE idempotency_key = ? AND status = 'COMPLETED'`, [idempotencyKey]);
    if (existing) return getRetailSale(db, existing.id);
  }

  return db.transaction(async (tx) => {
    const lock = tx.driver === 'postgres' ? ' FOR UPDATE' : '';
    const sale = await tx.get(`SELECT * FROM retail_sales WHERE id = ?${lock}`, [id]);
    if (!sale) throw bad('Sale not found.', 404);
    if (sale.status === 'COMPLETED') return getRetailSale(tx, id); // idempotent replay by sale id too
    if (sale.status !== 'HELD') throw bad(`Cannot check out a sale in status ${sale.status}.`, 409);
    const customerId=requestedCustomerId===undefined?sale.customer_id:requestedCustomerId;

    const existingLines = await tx.all(`SELECT * FROM retail_sale_lines WHERE retail_sale_id = ?`, [id]);
    if (!existingLines.length) throw bad('This sale has no lines.', 409);

    // Reload every variant fresh — never trust a stale HELD-time price snapshot
    // either. A price override must be re-affirmed here (opts.lines +
    // allowPriceOverride), not carried in from whatever was HELD earlier.
    const sourceLines = opts.lines?.length
      ? opts.lines
      : existingLines.map((l) => {
        let serialNumbers = [];
        try { serialNumbers = JSON.parse(l.serial_numbers_json || '[]'); } catch {}
        return { variantId: l.variant_id, quantity: l.quantity, discountAmount: l.discount_amount, serialNumbers };
      });

    // Promotions are re-evaluated fresh at checkout, authoritative (never
    // trusted from whatever was computed when the cart was HELD, same
    // boundary as price/discount below). line.discount_amount here means
    // "system-applied promotion discount" — the separate header
    // discountAmount below remains the cashier's own discretionary discount.
    const priceContext={customerId,channel:opts.channel||'retail_pos',at:new Date(),allowPriceOverride};
    const pricedLines=await priceRetailLines(tx,sourceLines,priceContext);
    const promoResult = await evaluateRetailPromotions(tx, {
      channel:priceContext.channel, lines: pricedLines, couponCode: opts.couponCode, customerId, allowBelowCost: opts.allowPriceOverride,
    });
    const sourceLinesWithPromo = sourceLines.map((l, i) => ({ ...l, discount_amount: (promoResult.lineDiscounts.get(i) ?? 0) + (allowDiscount ? Math.max(0, Number(l.manual_discount_amount) || 0) : 0), discountAmount: undefined }));
    const refreshedLines = await buildLines(tx, sourceLinesWithPromo, { allowPriceOverride,...priceContext,resolvedPrices:pricedLines.map(line=>line.price_resolution) });
    await replaceLines(tx, id, refreshedLines);

    const vatPercent = await getVatPercent(tx);
    let finalDiscount = discountAmount != null ? Number(discountAmount) : Number(sale.discount_amount || 0);
    // Re-affirmed here, not trusted from HELD state — same boundary as allowPriceOverride.
    if (finalDiscount > 0.005 && !allowDiscount) finalDiscount = 0;

    // Loyalty redemption is folded into the header discount, not a payment
    // method — see lib/retail-loyalty.js's file header for why (no liability
    // account backs it, unlike store credit). Quoted against the total
    // BEFORE redemption (a max-redemption-percent cap needs the pre-discount
    // figure), then applied as an additional discount.
    let loyaltyRedemption = { points: 0, value: 0 };
    if (opts.redeemLoyaltyPoints > 0) {
      if (!customerId) throw bad('Loyalty redemption requires an identified customer.', 400);
      const totalsBeforeLoyalty = sumHeaderTotals(refreshedLines, { discountAmount: finalDiscount, vatPercent });
      loyaltyRedemption = await quoteRedemption(tx, { customerId, points: opts.redeemLoyaltyPoints, saleTotal: totalsBeforeLoyalty.total });
      finalDiscount = round2(finalDiscount + loyaltyRedemption.value);
    }
    const deliveryFee=Number(opts.deliveryFee||0);
    if(!Number.isFinite(deliveryFee)||deliveryFee<0||deliveryFee>999999)throw bad('Invalid delivery charge');
    const totals = sumHeaderTotals(refreshedLines, { discountAmount: finalDiscount, vatPercent, deliveryFee });
    if(opts.expectedTotal!=null&&round2(opts.expectedTotal)!==totals.total)throw bad('The order price changed. Customer approval of a new quote is required.',409);
    await checkRetailMargins(tx,refreshedLines,{discount:finalDiscount,managerAuthorized:allowPriceOverride,enforce:true});

    // Store credit is validated/settled separately from validateAllocations()
    // (the 99 Shop-shared helper whose method allowlist is cash/online/credit
    // only) — split it out, redeem it against the customer's real balance
    // (an atomic, row-locked check inside redeemStoreCredit), and let
    // validateAllocations cover only whatever's left.
    const storeCreditEntries = (rawPayments || []).filter((p) => String(p.method).toLowerCase() === 'store_credit');
    const storeCreditTotal = round2(storeCreditEntries.reduce((s, p) => s + (Number(p.amount) || 0), 0));
    if (storeCreditTotal > 0 && !customerId) throw bad('Store credit requires an identified customer.', 400);
    if (storeCreditTotal > totals.total + 0.005) throw bad('Store credit allocation cannot exceed the sale total.', 400);

    const remainingAfterStoreCredit = round2(totals.total - storeCreditTotal);
    const otherPayments = (rawPayments || []).filter((p) => String(p.method).toLowerCase() !== 'store_credit');
    // validateAllocations enforces sum(allocations) === remaining exactly
    // (and, for a 'credit' allocation, that allowCredit + an identified,
    // non-blacklisted customer are both present) — nothing further to check here.
    const checkoutCustomer = customerId ? await tx.get(`SELECT id,is_blacklisted,credit_limit FROM customers WHERE id=?${lock}`, [customerId]) : null;
    const allocations = remainingAfterStoreCredit > 0.005
      ? validateAllocations(otherPayments, remainingAfterStoreCredit, { customer: checkoutCustomer, allowCredit })
      : [];
    const paidCents = allocations.filter((a) => a.method !== 'credit').reduce((s, a) => s + a.cents, 0) + Math.round(storeCreditTotal * 100);
    const creditCents = allocations.filter((a) => a.method === 'credit').reduce((s, a) => s + a.cents, 0);

    let creditOverride = null;
    if (creditCents > 0 && Number(checkoutCustomer?.credit_limit) > 0) {
      // The customer row is locked above, so two checkouts cannot both approve
      // an exposure based on the same prior total.
      const due = await tx.get(`SELECT COALESCE(SUM(amount_due),0) AS amount FROM retail_sales
        WHERE customer_id=? AND status='COMPLETED'`, [customerId]);
      const exposure = round2(due.amount);
      const creditAmount = fromCents(creditCents);
      const limit = round2(checkoutCustomer.credit_limit);
      if (exposure + creditAmount > limit + 0.005) {
        const reason = String(creditOverrideReason || '').trim();
        if (!allowCreditOverride || reason.length < 8) throw Object.assign(new Error(
          `This sale would exceed the customer credit limit by Rs ${round2(exposure + creditAmount - limit).toFixed(2)}. A Manager or Owner must enter an override reason.`),
        { status: 409, code: 'credit_limit_exceeded', exposure, creditLimit: limit, creditAmount });
        creditOverride = { exposure, creditAmount, limit, reason: reason.slice(0, 500) };
      }
    }

    const businessDayId = sale.business_day_id || await currentBusinessDayId(tx, { required: true });
    const locationId = sale.location_id || (await getDefaultLocation(tx))?.id;

    // Deduct inventory line by line — FEFO for batch-tracked variants, exact
    // variant for NONE. issueStock rejects insufficient (incl. expired-excluded)
    // stock outright; nothing partial is left behind because the whole thing
    // is one transaction.
    const finalLines = await tx.all(`SELECT * FROM retail_sale_lines WHERE retail_sale_id = ? ORDER BY id`, [id]);
    await lockRetailStock(tx,finalLines.map(line=>line.variant_id),locationId);
    let cogsTotal = 0;
    for (let i = 0; i < finalLines.length; i++) {
      const line = finalLines[i];
      const variant = await tx.get(`SELECT tracking_mode FROM product_variants WHERE id = ?`, [line.variant_id]);

      // Respects active online-order reservations — a unit reserved by a
      // confirmed online order is not available for a POS sale to also take.
      // See lib/retail-reservations.js's file header for how this and
      // confirmOrder() serialize against each other without touching issueStock.
      const availableToSell = await getAvailableToSell(tx, line.variant_id, locationId);
      if (Number(line.quantity) > availableToSell + 0.0005) {
        throw Object.assign(
          new Error(`"${line.product_name_snapshot}" has ${availableToSell} available to sell (some units are reserved for online orders) — cannot sell ${line.quantity}.`),
          { status: 409, code: 'insufficient_stock' }
        );
      }

      let applied;
      if (variant?.tracking_mode === 'serial') {
        // Exact serials, never FEFO/"any unit" — the cart line must name
        // exactly `quantity` serial numbers for a serial-tracked variant.
        const serialNumbers = sourceLines[i]?.serialNumbers || sourceLines[i]?.serial_numbers || [];
        if (serialNumbers.length !== Number(line.quantity)) {
          throw bad(`"${line.product_name_snapshot}" is serial-tracked — select exactly ${Number(line.quantity)} serial number(s), got ${serialNumbers.length}.`, 400);
        }
        const result = await allocateSerialsForSale(tx, {
          variantId: line.variant_id, locationId, serialNumbers, saleLineId: line.id,
          referenceId: line.id, businessDayId, createdBy: cashierId, reason: `Sale ${sale.sale_number || '#' + sale.id}`,
        });
        applied = result.applied;
      } else {
        applied = await issueStock(tx, {
          variantId: line.variant_id, locationId, quantity: line.quantity,
          movementType: 'SALE', referenceType: 'retail_sale_line', referenceId: line.id,
          reason: `Sale ${sale.sale_number || '#' + sale.id}`, businessDayId, createdBy: cashierId,
        });
      }
      let lineCost = 0;
      for (const a of applied) {
        const qty = Math.abs(Number(a.movement.quantity));
        lineCost = round2(lineCost + Number(a.movement.total_cost || 0));
        if (a.movement.batch_id) {
          await tx.run(
            `INSERT INTO retail_sale_line_batches (retail_sale_line_id, batch_id, quantity) VALUES (?, ?, ?)`,
            [line.id, a.movement.batch_id, qty]
          );
        }
      }
      await tx.run(`UPDATE retail_sale_lines SET unit_cost = ?, total_cost = ? WHERE id = ?`, [
        line.quantity > 0 ? lineCost / line.quantity : 0, lineCost, line.id,
      ]);
      cogsTotal = round2(cogsTotal + lineCost);
    }

    for (const a of allocations) {
      await tx.run(
        `INSERT INTO retail_sale_payments (retail_sale_id, method, amount, cash_tendered, change_given, reference, provider)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, a.method, a.amount, a.cashTenderedCents ? fromCents(a.cashTenderedCents) : null,
          a.cashTenderedCents ? round2(fromCents(a.cashTenderedCents) - a.amount) : null,
          a.reference, a.provider]
      );
    }
    if (storeCreditTotal > 0.005) {
      // Ledger + atomic balance check/lock only — this function never posts its
      // own journal (see its doc comment); the Dr 2030 leg is added below,
      // inside this sale's own compound journal.
      await redeemStoreCredit(tx, { customerId, amount: storeCreditTotal, sourceType: 'retail_sale', sourceId: id, reason: `Redeemed at checkout — sale #${id}`, createdBy: cashierId });
      await tx.run(
        `INSERT INTO retail_sale_payments (retail_sale_id, method, amount) VALUES (?, 'store_credit', ?)`,
        [id, storeCreditTotal]
      );
    }

    if (promoResult.appliedPromotions.length) {
      await recordRetailPromotionRedemptions(tx, { appliedPromotions: promoResult.appliedPromotions, retailSaleId: id, customerPhone: promoResult.phone,channel:priceContext.channel });
    }
    if (loyaltyRedemption.points > 0) {
      // Ledger only, no journal leg — see file header of lib/retail-loyalty.js.
      await redeemPoints(tx, { customerId, points: loyaltyRedemption.points, sourceType: 'retail_sale', sourceId: id, reason: `Redeemed at checkout — sale #${id}`, createdBy: cashierId });
    }
    // Earned on the FINAL net subtotal — after promotions, manual discount
    // and loyalty redemption all reduced it — never on gross.
    await earnPointsForSale(tx, { customerId, netAmount: round2(totals.subtotal - totals.discount), sourceType: 'retail_sale', sourceId: id, createdBy: cashierId });

    const saleNumber = sale.sale_number || await nextDocumentNumber(tx, { type: 'retail_sale', prefix: 'INV' });
    await postRetailSaleJournal(tx, {
      saleId: id,
      entryDate: null,
      businessDayId,
      createdBy: cashierId,
      payments: allocations.map((a) => ({ method: a.method, amount: a.amount })),
      storeCreditAmount: storeCreditTotal,
      taxAmount: totals.tax,
      subtotalAfterDiscount: round2(totals.subtotal - totals.discount + deliveryFee),
      cogsTotal,
      customerId,
    });

    await tx.run(
      `UPDATE retail_sales
       SET sale_number = ?, status = 'COMPLETED', customer_id = ?, cashier_id = ?, business_day_id = ?,
           subtotal = ?, discount_amount = ?, discount_reason = ?, tax_amount = ?, grand_total = ?,
           amount_paid = ?, amount_due = ?, cogs_total = ?, idempotency_key = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [saleNumber, customerId, cashierId ?? sale.cashier_id, businessDayId,
        totals.subtotal, totals.discount, discountReason ?? sale.discount_reason, totals.tax, totals.total,
        fromCents(paidCents), fromCents(creditCents), cogsTotal, idempotencyKey, id]
    );

    await tx.run('UPDATE retail_sales SET channel=?,delivery_charge=? WHERE id=?',[priceContext.channel,deliveryFee,id]);
    await snapshotSaleWarranty(tx, id);

    if (creditOverride) {
      await tx.run(`INSERT INTO retail_credit_overrides
        (retail_sale_id,customer_id,credit_amount,exposure_before,credit_limit,reason,approved_by)
        VALUES (?,?,?,?,?,?,?)`, [id, customerId, creditOverride.creditAmount, creditOverride.exposure,
        creditOverride.limit, creditOverride.reason, cashierId]);
    }

    return getRetailSale(tx, id);
  });
}

const RETAIL_SALE_SORTS = {
  completed_at: 's.completed_at',
  sale_number: 's.sale_number',
  grand_total: 's.grand_total',
  status: 's.status',
};
const RETAIL_SALE_SEARCH_COLUMNS = ['s.sale_number', 'c.name', 'c.phone', 'u.full_name'];

/** Server-side paginated/filtered history — never ships the whole table to the browser. */
export async function listRetailSales(db, {
  status = null, cashierId = null, customerId = null, businessDayId = null, paymentMethod = null,
  from = null, to = null, minAmount = null, maxAmount = null, page = 1, pageSize = 50, exportAll = false, sort = '', dir = 'DESC', search = '',
} = {}) {
  await ensureRetailSalesSchema(db);
  const conditions = ["s.status <> 'HELD'"]; // history = completed/cancelled, not in-progress carts
  const params = [];
  if (status) { conditions.push('s.status = ?'); params.push(status); }
  if (cashierId) { conditions.push('s.cashier_id = ?'); params.push(cashierId); }
  if (customerId) { conditions.push('s.customer_id = ?'); params.push(customerId); }
  if (businessDayId) { conditions.push('s.business_day_id = ?'); params.push(businessDayId); }
  if (from) { conditions.push('s.completed_at >= ?'); params.push(from); }
  if (to) { conditions.push('s.completed_at <= ?'); params.push(`${to} 23:59:59`); }
  if (minAmount != null && minAmount !== '' && Number.isFinite(Number(minAmount)) && Number(minAmount) >= 0) { conditions.push('s.grand_total >= ?'); params.push(Number(minAmount)); }
  if (maxAmount != null && maxAmount !== '' && Number.isFinite(Number(maxAmount)) && Number(maxAmount) >= 0) { conditions.push('s.grand_total <= ?'); params.push(Number(maxAmount)); }
  if (paymentMethod) {
    conditions.push('EXISTS (SELECT 1 FROM retail_sale_payments p WHERE p.retail_sale_id = s.id AND p.method = ?)');
    params.push(paymentMethod);
  }
  const searchClause = buildSearch(search, RETAIL_SALE_SEARCH_COLUMNS);
  if (searchClause.clause) {
    const barcode = await findByBarcode(db, search);
    const lineTerms = [`lower(COALESCE(sl.sku_snapshot,'')) LIKE ?`];
    const lineParams = [`%${search.toLowerCase()}%`];
    if (barcode?.variantId) { lineTerms.push('sl.variant_id=?'); lineParams.push(barcode.variantId); }
    else if (barcode?.productId) { lineTerms.push('sl.variant_id IN (SELECT id FROM product_variants WHERE product_id=?)'); lineParams.push(barcode.productId); }
    conditions.push(`(${searchClause.clause} OR EXISTS (SELECT 1 FROM retail_sale_lines sl WHERE sl.retail_sale_id=s.id AND (${lineTerms.join(' OR ')})))`);
    params.push(...searchClause.params, ...lineParams);
  }

  return paginateQuery(db, {
    columns: `s.*, u.full_name AS cashier_name, c.name AS customer_name`,
    from: `retail_sales s LEFT JOIN users u ON u.id = s.cashier_id LEFT JOIN customers c ON c.id = s.customer_id`,
    where: conditions.join(' AND '),
    params,
    orderBy: resolveOrderBy(sort, dir, RETAIL_SALE_SORTS, 'completed_at', 's.id'),
    page, pageSize, exportAll,
  });
}
