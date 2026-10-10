import { ensureProductCatalogSchema } from '@/lib/product-catalog.js';
/**
 * Retail analytics — the metrics an owner actually checks, not an open-ended
 * BI layer. Every number is derived from the SAME authoritative sources
 * every other retail file already uses: journal_lines (via
 * lib/accounting-reports.js/accounting.js — never a duplicated GL
 * calculation), retail_sales/retail_sale_lines, and
 * lib/retail-inventory-reports.js (Phase 6 — reused, not reimplemented, for
 * every inventory-side metric).
 *
 * ── PROFIT IS ALWAYS ACTUAL COGS, NEVER "PRICE MINUS LAST COST" ───────────
 * Every profit/margin figure here sums retail_sale_lines.total_cost — the
 * moving-average cost snapshotted at the moment of that sale (lib/retail-
 * sales.js) — never today's cost, never list price minus purchase price.
 *
 * ── GROSS / DISCOUNT / NET, THE SAME SPLIT PROMOTIONS ALREADY PRODUCE ─────
 * Gross Sales = Σ(unit_price × quantity) — list price, no discount removed.
 * Discount = Σ(retail_sale_lines.discount_amount) [promotions + loyalty
 *   redemption, both already land there] + Σ(retail_sales.discount_amount)
 *   [the header manual discount].
 * Net Sales = Gross − Discount (equivalently, Σ(retail_sales.subtotal) −
 *   Σ(retail_sales.discount_amount), which is what grand_total is built
 *   from). No separate calculation invented — see lib/retail-sales.js.
 */

import { ensureAccountingSchema } from '@/lib/accounting.js';
import { profitAndLoss } from '@/lib/accounting-reports.js';
import { ensureRetailOnlineOrderSchema } from '@/lib/retail-online-orders.js';
import { ensureRetailSalesSchema } from '@/lib/retail-sales.js';
import { ensureRetailReturnsSchema } from '@/lib/retail-returns.js';
import { accountBalance } from '@/lib/accounting.js';
import { getInventoryValuation } from '@/lib/retail-inventory.js';
import { getLowStock, getOutOfStock, reconcileInventoryValuation } from '@/lib/retail-inventory-reports.js';
import { getExpiredStock, getExpiringStock } from '@/lib/retail-inventory.js';
import { getStoreCreditBalance } from '@/lib/retail-store-credit.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function dateRangeClause(alias, from, to) {
  const clauses = [];
  const params = [];
  if (from) { clauses.push(`${alias}.completed_at >= ?`); params.push(from); }
  if (to) { clauses.push(`${alias}.completed_at <= ?`); params.push(`${to} 23:59:59`); }
  return { clause: clauses.length ? `AND ${clauses.join(' AND ')}` : '', params };
}

/** Sum(gross/discount/net/cogs/profit) for completed retail sales in [from, to]. */
export async function getRetailSalesTotals(db, { from = null, to = null } = {}) {
  const { clause, params } = dateRangeClause('s', from, to);
  const row = await db.get(
    `SELECT COALESCE(SUM(sl.unit_price * sl.quantity), 0) AS gross,
            COALESCE(SUM(sl.discount_amount), 0) AS line_discount,
            COALESCE(SUM(sl.net_amount), 0) AS net_before_header_discount,
            COALESCE(SUM(sl.total_cost), 0) AS cogs,
            COUNT(DISTINCT s.id) AS transactions,
            COALESCE(SUM(sl.quantity), 0) AS items
       FROM retail_sale_lines sl JOIN retail_sales s ON s.id = sl.retail_sale_id
      WHERE s.status = 'COMPLETED' ${clause}`,
    params
  );
  // header_discount_raw double-counts across lines (it's a header-level value summed once per line) — recompute cleanly.
  const headerRow = await db.get(
    `SELECT COALESCE(SUM(s.discount_amount), 0) AS header_discount,
            COALESCE(SUM(s.tax_amount), 0) AS tax
       FROM retail_sales s WHERE s.status = 'COMPLETED' ${clause}`,
    params
  );
  const gross = round2(row?.gross);
  const lineDiscount = round2(row?.line_discount);
  const headerDiscount = round2(headerRow?.header_discount);
  const discount = round2(lineDiscount + headerDiscount);
  const netSales = round2(gross - discount);
  const cogs = round2(row?.cogs);
  const grossProfit = round2(netSales - cogs);
  return {
    grossSales: gross, discount, netSales, tax: round2(headerRow?.tax), cogs, grossProfit,
    marginPercent: netSales > 0 ? round2((grossProfit / netSales) * 100) : 0,
    transactions: Number(row?.transactions || 0), items: Number(row?.items || 0),
    averageBasketValue: Number(row?.transactions) > 0 ? round2(netSales / Number(row.transactions)) : 0,
    itemsPerTransaction: Number(row?.transactions) > 0 ? round2(Number(row.items) / Number(row.transactions)) : 0,
  };
}

/** Return value in the same window — reduces reported net revenue/profit honestly. */
async function returnsTotals(db, { from = null, to = null } = {}) {
  const clauses = [];
  const params = [];
  if (from) { clauses.push(`r.posted_at >= ?`); params.push(from); }
  if (to) { clauses.push(`r.posted_at <= ?`); params.push(`${to} 23:59:59`); }
  const where = clauses.length ? `AND ${clauses.join(' AND ')}` : '';
  const row = await db.get(
    `SELECT COALESCE(SUM(r.refund_total), 0) AS refund_total,
            COALESCE(SUM(r.tax_reversal_total), 0) AS tax_reversal,
            COUNT(*) AS count,
            COALESCE(SUM((SELECT COALESCE(SUM(COALESCE(rl.total_cogs,ROUND(rl.unit_cogs * rl.quantity,2))),0)
                          FROM retail_return_lines rl
                          WHERE rl.retail_return_id=r.id AND rl.disposition <> 'NO_STOCK_RETURN')), 0) AS cogs_reversal
       FROM retail_returns r
      WHERE r.status = 'POSTED' ${where}`,
    params
  );
  return {
    returnValue: round2(row?.refund_total),
    returnedRevenue: round2(Number(row?.refund_total || 0) - Number(row?.tax_reversal || 0)),
    returnedTax: round2(row?.tax_reversal),
    cogsReversal: round2(row?.cogs_reversal),
    returnCount: Number(row?.count || 0),
  };
}

/** §40 — the numbers an owner checks first. Sales/returns are windowed; balance-sheet-style figures (inventory, AP/AR, cash, store credit) are always "as of now". */
export async function getExecutiveDashboard(db, { from = null, to = null } = {}) {
  await ensureProductCatalogSchema(db);
  await ensureAccountingSchema(db);
  await ensureRetailSalesSchema(db);
  await ensureRetailReturnsSchema(db);
  const [sales, returns, valuation, valuationRecon, lowStock, outOfStock, expired, expiring90, pnl] = await Promise.all([
    getRetailSalesTotals(db, { from, to }),
    returnsTotals(db, { from, to }),
    getInventoryValuation(db),
    reconcileInventoryValuation(db),
    getLowStock(db),
    getOutOfStock(db),
    getExpiredStock(db),
    getExpiringStock(db, 90),
    profitAndLoss(db, { from, to }),
  ]);
  const [ap, ar, cash, bank, storeCreditLiability] = await Promise.all([
    accountBalance(db, '2010'), accountBalance(db, '1300'), accountBalance(db, '1010'), accountBalance(db, '1020'), accountBalance(db, '2030'),
  ]);
  // Expired carrying value priced at each variant's own moving average —
  // the same figure getInventoryValuation() already computed, just filtered
  // down to the expired rows (no separate cost lookup invented).
  const costByVariant = new Map(valuation.byVariant.map((v) => [v.variantId, v.averageCost]));
  const expiredValue = round2(expired.reduce((s, r) => s + Number(r.quantity_on_hand) * (costByVariant.get(r.variant_id) || 0), 0));
  const paymentRange = dateRangeClause('s', from, to);
  const paymentRows = await db.all(
    `SELECT LOWER(p.method) AS method, COALESCE(SUM(p.amount),0) AS amount, COUNT(*) AS count
       FROM retail_sale_payments p JOIN retail_sales s ON s.id=p.retail_sale_id
      WHERE s.status='COMPLETED' ${paymentRange.clause}
      GROUP BY LOWER(p.method)`, paymentRange.params
  );
  const paymentMap = Object.fromEntries(paymentRows.map((row) => [row.method, round2(row.amount)]));
  const netSales = round2(sales.netSales - returns.returnedRevenue);
  const netCogs = round2(sales.cogs - returns.cogsReversal);
  const grossProfit = round2(netSales - netCogs);
  return {
    ...sales,
    tax: round2(sales.tax - returns.returnedTax), cogs: netCogs, grossProfit,
    marginPercent: netSales > 0 ? round2((grossProfit / netSales) * 100) : 0,
    returnValue: returns.returnValue, returnedRevenue: returns.returnedRevenue, returnCount: returns.returnCount,
    netSales, netRevenue: netSales,
    payments: paymentMap, cashPayments: paymentMap.cash || 0,
    digitalPayments: paymentMap.online || 0, customerCreditSales: paymentMap.credit || 0,
    inventoryValue: valuation.total, inventoryReconciled: valuationRecon.reconciled,
    lowStockCount: lowStock.length, outOfStockCount: outOfStock.length,
    expiredBatchCount: expired.length, nearExpiryBatchCount: expiring90.length, expiredValue,
    // accountBalance() is debit-credit: an asset (AR, cash, bank) is naturally
    // positive; a liability (AP, store credit) is naturally negative when
    // money is owed, so it's negated here into the positive "amount owed" a
    // dashboard reads naturally.
    supplierPayables: round2(-Number(ap)), customerReceivables: round2(Number(ar)),
    cashPosition: round2(Number(cash) + Number(bank)),
    storeCreditLiability: round2(-Number(storeCreditLiability)),
    netProfit: pnl.netProfit,
  };
}

/** §41 — sales grouped by one dimension, each row carrying the full gross/discount/net/cogs/profit/margin breakdown. */
export async function getSalesByDimension(db, { from = null, to = null, groupBy = 'product' } = {}) {
  const { clause, params } = dateRangeClause('s', from, to);
  if (groupBy === 'payment_method') {
    const rows = await db.all(
      `SELECT LOWER(p.method) AS label, COALESCE(SUM(p.amount),0) AS payment_amount,
              COUNT(DISTINCT p.retail_sale_id) AS transactions
         FROM retail_sale_payments p JOIN retail_sales s ON s.id=p.retail_sale_id
        WHERE s.status='COMPLETED' ${clause}
        GROUP BY LOWER(p.method) ORDER BY payment_amount DESC`, params
    );
    // Payment allocation is a collection fact, not product revenue. Keeping it
    // separate prevents split tenders from duplicating revenue and COGS.
    return rows.map((row) => ({
      label: row.label || 'unknown', paymentAmount: round2(row.payment_amount),
      transactions: Number(row.transactions || 0),
    }));
  }
  const dims = {
    product: { select: 'sl.product_name_snapshot AS label', group: 'sl.product_name_snapshot' },
    variant: { select: `sl.product_name_snapshot || COALESCE(' · ' || sl.variant_name_snapshot, '') AS label`, group: 'sl.variant_id, label' },
    category: { select: 'mi.category_id AS label_id, mc.name AS label', group: 'mi.category_id, mc.name', extraJoin: 'JOIN menu_item_variants v ON v.id = sl.variant_id JOIN menu_items mi ON mi.id = v.menu_item_id LEFT JOIN menu_categories mc ON mc.id = mi.category_id' },
    brand: { select: `COALESCE(mi.brand, 'Unbranded') AS label`, group: 'label', extraJoin: 'JOIN menu_item_variants v ON v.id = sl.variant_id JOIN menu_items mi ON mi.id = v.menu_item_id' },
    cashier: { select: `COALESCE(u.full_name, 'Unknown') AS label`, group: 'label', extraJoin: 'LEFT JOIN users u ON u.id = s.cashier_id' },
    // Keyed by user id so two staff with the same name stay separate.
    staff: { select: 's.cashier_id AS label', group: 's.cashier_id' },
    customer: { select: `COALESCE(c.name, 'Walk-in') AS label`, group: 'label', extraJoin: 'LEFT JOIN customers c ON c.id = s.customer_id' },
    day: { select: `date(s.completed_at) AS label`, returnSelect: `date(r.posted_at) AS label`, group: 'label' },
  };
  const dim = dims[groupBy] || dims.product;
  const rows = await db.all(
    `SELECT ${dim.select}, COALESCE(SUM(sl.unit_price * sl.quantity), 0) AS gross,
            COALESCE(SUM((sl.unit_price*sl.quantity) -
              (sl.net_amount - CASE WHEN s.subtotal>0 THEN s.discount_amount*sl.net_amount/s.subtotal ELSE 0 END)), 0) AS discount,
            COALESCE(SUM(sl.net_amount - CASE WHEN s.subtotal>0 THEN s.discount_amount*sl.net_amount/s.subtotal ELSE 0 END), 0) AS net,
            COALESCE(SUM(sl.total_cost), 0) AS cogs, COALESCE(SUM(sl.quantity), 0) AS quantity,
            COUNT(DISTINCT sl.retail_sale_id) AS transactions
       FROM retail_sale_lines sl JOIN retail_sales s ON s.id = sl.retail_sale_id
       ${dim.extraJoin || ''}
      WHERE s.status = 'COMPLETED' ${clause}
      GROUP BY ${dim.group}
      ORDER BY net DESC`,
    params
  );
  const returnClauses = [];
  const returnParams = [];
  if (from) { returnClauses.push('r.posted_at >= ?'); returnParams.push(from); }
  if (to) { returnClauses.push('r.posted_at <= ?'); returnParams.push(`${to} 23:59:59`); }
  const returnWhere = returnClauses.length ? `AND ${returnClauses.join(' AND ')}` : '';
  const returned = await db.all(
    `SELECT ${dim.returnSelect || dim.select},
            COALESCE(SUM(rl.refund_amount-rl.tax_allocated),0) AS returned_revenue,
            COALESCE(SUM(CASE WHEN rl.disposition<>'NO_STOCK_RETURN' THEN COALESCE(rl.total_cogs,ROUND(rl.unit_cogs*rl.quantity,2)) ELSE 0 END),0) AS cogs_reversal,
            COALESCE(SUM(rl.quantity),0) AS quantity,COUNT(DISTINCT r.id) AS return_count
       FROM retail_return_lines rl
       JOIN retail_returns r ON r.id=rl.retail_return_id
       JOIN retail_sale_lines sl ON sl.id=rl.original_sale_line_id
       JOIN retail_sales s ON s.id=r.original_sale_id
       ${dim.extraJoin || ''}
      WHERE r.status='POSTED' ${returnWhere}
      GROUP BY ${dim.group}`,
    returnParams
  );
  const byLabel = new Map(rows.map((row) => [row.label || 'Unknown', row]));
  for (const row of returned) {
    const label = row.label || 'Unknown';
    const target = byLabel.get(label) || { label, gross: 0, discount: 0, net: 0, cogs: 0, quantity: 0, transactions: 0 };
    target.net = Number(target.net || 0) - Number(row.returned_revenue || 0);
    target.cogs = Number(target.cogs || 0) - Number(row.cogs_reversal || 0);
    target.quantity = Number(target.quantity || 0) - Number(row.quantity || 0);
    target.return_count = Number(row.return_count || 0);
    byLabel.set(label, target);
  }
  return [...byLabel.values()].map((r) => {
    const net = round2(r.net);
    const cogs = round2(r.cogs);
    const profit = round2(net - cogs);
    return {
      label: r.label || 'Unknown', grossSales: round2(r.gross), discount: round2(r.discount), netSales: net,
      cogs, grossProfit: profit, marginPercent: net > 0 ? round2((profit / net) * 100) : 0,
      quantity: Number(r.quantity), transactions: Number(r.transactions), returnCount: Number(r.return_count || 0),
    };
  });
}

/** §42 — top/bottom sellers by each of the three DIFFERENT rankings (never conflated). */
export async function getProductPerformance(db, { from = null, to = null, limit = 10 } = {}) {
  const rows = await getSalesByDimension(db, { from, to, groupBy: 'product' });
  const n = Math.min(50, Math.max(1, Number(limit) || 10));
  const byRevenue = [...rows].sort((a, b) => b.netSales - a.netSales);
  const byProfit = [...rows].sort((a, b) => b.grossProfit - a.grossProfit);
  const byMargin = [...rows].filter((r) => r.netSales > 0).sort((a, b) => b.marginPercent - a.marginPercent);
  const byQuantity = [...rows].sort((a, b) => b.quantity - a.quantity);
  return {
    topByRevenue: byRevenue.slice(0, n), bottomByRevenue: byRevenue.slice(-n).reverse(),
    topByProfit: byProfit.slice(0, n), bottomByProfit: byProfit.slice(-n).reverse(),
    topByMargin: byMargin.slice(0, n), topByQuantity: byQuantity.slice(0, n),
  };
}

/** §46 — spend/frequency/return-rate per customer; new vs returning within the window. */
export async function getCustomerAnalytics(db, { from = null, to = null, limit = 20 } = {}) {
  const { clause, params } = dateRangeClause('s', from, to);
  const rows = await db.all(
    `SELECT s.customer_id, COALESCE(c.name, 'Walk-in') AS name,
            COUNT(*) AS visits, COALESCE(SUM(s.grand_total-s.tax_amount), 0) AS revenue,
            COALESCE(SUM((SELECT COALESCE(SUM(sl.total_cost),0)
                           FROM retail_sale_lines sl WHERE sl.retail_sale_id=s.id)), 0) AS cogs
       FROM retail_sales s
       LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.status = 'COMPLETED' AND s.customer_id IS NOT NULL ${clause}
      GROUP BY s.customer_id, name
      ORDER BY revenue DESC LIMIT ?`,
    [...params, Math.min(200, Math.max(1, Number(limit) || 20))]
  );
  const newCustomersRow = await db.get(
    `SELECT COUNT(*) AS n FROM customers
      WHERE created_at >= COALESCE(CAST(? AS TIMESTAMP), CAST('0001-01-01' AS TIMESTAMP))
        AND created_at <= COALESCE(CAST(? AS TIMESTAMP), CAST('9999-12-31' AS TIMESTAMP))`,
    [from, to ? `${to} 23:59:59` : null]
  );
  const topByRevenue = rows.map((r) => ({
    customerId: r.customer_id, name: r.name, visits: Number(r.visits), revenue: round2(r.revenue),
    grossProfit: round2(r.revenue - r.cogs), averageSpend: Number(r.visits) > 0 ? round2(r.revenue / r.visits) : 0,
  }));
  return { topByRevenue, newCustomers: Number(newCustomersRow?.n || 0) };
}

/** §47 — reuses promotion_redemptions (lib/retail-promotions.js), never a parallel calculation. */
export async function getPromotionAnalytics(db, { from = null, to = null } = {}) {
  const clauses = [`pr.channel = 'retail_pos'`];
  const params = [];
  if (from) { clauses.push(`pr.created_at >= ?`); params.push(from); }
  if (to) { clauses.push(`pr.created_at <= ?`); params.push(`${to} 23:59:59`); }
  const rows = await db.all(
    `SELECT pr.promotion_id, pr.promotion_name, pr.promotion_code, COUNT(*) AS uses,
            COALESCE(SUM(pr.discount_amount), 0) AS discount_given,
            COALESCE(SUM(s.grand_total), 0) AS gross_sales_influenced
       FROM promotion_redemptions pr
       LEFT JOIN retail_sales s ON s.id = pr.retail_sale_id
      WHERE ${clauses.join(' AND ')}
      GROUP BY pr.promotion_id, pr.promotion_name, pr.promotion_code
      ORDER BY discount_given DESC`,
    params
  );
  return rows.map((r) => ({
    promotionId: r.promotion_id, name: r.promotion_name, code: r.promotion_code, uses: Number(r.uses),
    discountGiven: round2(r.discount_given), grossSalesInfluenced: round2(r.gross_sales_influenced),
    averageBasket: Number(r.uses) > 0 ? round2(r.gross_sales_influenced / r.uses) : 0,
  }));
}

/** §48 — statistics kept separate from the loyalty ledger's own accounting (lib/retail-loyalty.js never posts to any GL account). */
export async function getLoyaltyAnalytics(db) {
  const issued = await db.get(`SELECT COALESCE(SUM(points), 0) AS total FROM loyalty_transactions WHERE type = 'EARN'`);
  const redeemed = await db.get(`SELECT COALESCE(SUM(-points), 0) AS total FROM loyalty_transactions WHERE type = 'REDEEM'`);
  const outstanding = await db.get(`SELECT COALESCE(SUM(loyalty_points_balance), 0) AS total FROM customers`);
  const active = await db.get(`SELECT COUNT(DISTINCT customer_id) AS n FROM loyalty_transactions`);
  const salesWithLoyalty = await db.get(`SELECT COUNT(DISTINCT source_id) AS n FROM loyalty_transactions WHERE type = 'REDEEM' AND source_type = 'retail_sale'`);
  const pointsIssued = round2(issued?.total);
  const pointsRedeemed = round2(redeemed?.total);
  return {
    activeLoyaltyCustomers: Number(active?.n || 0), pointsIssued, pointsRedeemed,
    pointsOutstanding: round2(outstanding?.total), redemptionRate: pointsIssued > 0 ? round2((pointsRedeemed / pointsIssued) * 100) : 0,
    salesInvolvingLoyalty: Number(salesWithLoyalty?.n || 0),
  };
}

/** §49 — expanded returns report with filters + resellable-vs-not + refund-method split. */
export async function getReturnsAnalytics(db, { from = null, to = null, condition = null, refundMethod = null, cashierId = null } = {}) {
  const clauses = [`r.status = 'POSTED'`];
  const params = [];
  if (from) { clauses.push(`r.posted_at >= ?`); params.push(from); }
  if (to) { clauses.push(`r.posted_at <= ?`); params.push(`${to} 23:59:59`); }
  if (refundMethod) { clauses.push(`r.refund_method = ?`); params.push(refundMethod); }
  if (cashierId) { clauses.push(`r.cashier_id = ?`); params.push(cashierId); }
  if (condition) { clauses.push(`rl.condition = ?`); params.push(condition); }

  const totals = await db.get(
    `SELECT COALESCE(SUM(r.refund_total), 0) AS refund_total, COUNT(DISTINCT r.id) AS return_count,
            COALESCE(SUM(CASE WHEN rl.disposition = 'RETURN_TO_SELLABLE' THEN rl.quantity ELSE 0 END), 0) AS resellable_qty,
            COALESCE(SUM(CASE WHEN rl.disposition != 'RETURN_TO_SELLABLE' THEN rl.quantity ELSE 0 END), 0) AS non_resellable_qty
       FROM retail_returns r JOIN retail_return_lines rl ON rl.retail_return_id = r.id
      WHERE ${clauses.join(' AND ')}`,
    params
  );
  const byReason = await db.all(
    `SELECT COALESCE(rl.reason, r.reason, 'Unspecified') AS reason, COUNT(*) AS count, COALESCE(SUM(rl.refund_amount), 0) AS value
       FROM retail_returns r JOIN retail_return_lines rl ON rl.retail_return_id = r.id
      WHERE ${clauses.join(' AND ')} GROUP BY COALESCE(rl.reason, r.reason, 'Unspecified') ORDER BY value DESC`,
    params
  );
  const byRefundMethod = await db.all(
    `SELECT r.refund_method, COUNT(DISTINCT r.id) AS count, COALESCE(SUM(r.refund_total), 0) AS value
       FROM retail_returns r JOIN retail_return_lines rl ON rl.retail_return_id = r.id
      WHERE ${clauses.join(' AND ')} GROUP BY r.refund_method ORDER BY value DESC`,
    params
  );
  const mostReturned = await db.all(
    `SELECT sl.product_name_snapshot AS product, COUNT(*) AS lines, COALESCE(SUM(rl.quantity), 0) AS quantity, COALESCE(SUM(rl.refund_amount), 0) AS value
       FROM retail_returns r JOIN retail_return_lines rl ON rl.retail_return_id = r.id JOIN retail_sale_lines sl ON sl.id = rl.original_sale_line_id
      WHERE ${clauses.join(' AND ')} GROUP BY sl.product_name_snapshot ORDER BY value DESC LIMIT 20`,
    params
  );
  const salesInWindow = await getRetailSalesTotals(db, { from, to });
  return {
    returnValue: round2(totals?.refund_total), returnCount: Number(totals?.return_count || 0),
    returnRate: salesInWindow.netSales > 0 ? round2((round2(totals?.refund_total) / salesInWindow.netSales) * 100) : 0,
    resellableQuantity: Number(totals?.resellable_qty || 0), nonResellableQuantity: Number(totals?.non_resellable_qty || 0),
    byReason: byReason.map((r) => ({ reason: r.reason, count: Number(r.count), value: round2(r.value) })),
    byRefundMethod: byRefundMethod.map((r) => ({ method: r.refund_method, count: Number(r.count), value: round2(r.value) })),
    mostReturned: mostReturned.map((r) => ({ product: r.product, lines: Number(r.lines), quantity: Number(r.quantity), value: round2(r.value) })),
  };
}

/** §50 — reuses existing supplier/AP/GRN data; no new calculation for cost/AP. */
export async function getPurchaseAnalytics(db, { from = null, to = null } = {}) {
  const clauses = [`g.status = 'POSTED'`];
  const params = [];
  if (from) { clauses.push(`g.posted_at >= ?`); params.push(from); }
  if (to) { clauses.push(`g.posted_at <= ?`); params.push(`${to} 23:59:59`); }
  const bySupplier = await db.all(
    `SELECT sup.name AS supplier, COUNT(DISTINCT g.id) AS receipts, COALESCE(SUM(gl.net_amount), 0) AS value,
            COALESCE(AVG(gl.unit_cost), 0) AS avg_unit_cost
       FROM goods_receipts g JOIN goods_receipt_lines gl ON gl.goods_receipt_id = g.id JOIN suppliers sup ON sup.id = g.supplier_id
      WHERE ${clauses.join(' AND ')} GROUP BY sup.name ORDER BY value DESC`,
    params
  );
  const totalPurchases = round2(bySupplier.reduce((s, r) => s + Number(r.value), 0));
  const returnsRow = await db.get(
    `SELECT COALESCE(SUM(prl.net_amount), 0) AS total FROM purchase_returns pr JOIN purchase_return_lines prl ON prl.purchase_return_id = pr.id WHERE pr.status = 'POSTED'`
  ).catch(() => ({ total: 0 }));
  const apBalance = round2(-Number(await accountBalance(db, '2010')));
  return {
    bySupplier: bySupplier.map((r) => ({ supplier: r.supplier, receipts: Number(r.receipts), value: round2(r.value), averageCost: round2(r.avg_unit_cost) })),
    totalPurchases, purchaseReturns: round2(returnsRow?.total || 0), supplierPayables: apBalance,
  };
}

/** CSV export — small, dependency-free, matches ProfileTabActions' pattern used elsewhere. */
export function toCsv(headers, rows) {
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n');
}

/** Channel dimensions read canonical posted facts; orders are never revenue. */
export async function retailChannelReport(db){
  await ensureRetailOnlineOrderSchema(db);
  await ensureProductCatalogSchema(db);
  await ensureAccountingSchema(db);
  await ensureRetailSalesSchema(db);
  await ensureRetailReturnsSchema(db);
  const sales=await db.all("SELECT channel,COUNT(*) AS sales,SUM(grand_total-tax_amount) AS revenue,SUM(cogs_total) AS cogs,AVG(grand_total) AS average_sale FROM retail_sales WHERE status='COMPLETED' GROUP BY channel");
  const returns=await db.all("SELECT s.channel,SUM(r.refund_total-r.tax_reversal_total) AS amount FROM retail_returns r JOIN retail_sales s ON s.id=r.original_sale_id WHERE r.status='POSTED' GROUP BY s.channel");
  const costs=await db.all("SELECT s.channel,SUM(jl.credit-jl.debit) AS amount FROM journal_entries j JOIN journal_lines jl ON jl.journal_id=j.id JOIN accounts a ON a.id=jl.account_id JOIN retail_returns r ON r.id=j.source_id AND j.source_type='retail_return' JOIN retail_sales s ON s.id=r.original_sale_id WHERE a.code='5080' GROUP BY s.channel");
  return {channels:sales.map(s=>{const returned=Number(returns.find(r=>r.channel===s.channel)?.amount||0),net=round2(Number(s.revenue)-returned),cogs=round2(Number(s.cogs)-Number(costs.find(r=>r.channel===s.channel)?.amount||0));return {channel:s.channel,sales:Number(s.sales),net_revenue:net,returns:returned,cogs,gross_profit:round2(net-cogs),average_sale:round2(s.average_sale)};}),
    payments:await db.all("SELECT s.channel,p.method,SUM(p.amount) AS amount FROM retail_sale_payments p JOIN retail_sales s ON s.id=p.retail_sale_id WHERE s.status='COMPLETED' GROUP BY s.channel,p.method"),
    orders:await db.all("SELECT CASE WHEN retail_sale_id IS NULL AND status NOT IN ('CANCELLED','DELIVERED') AND reservation_expires_at<=CURRENT_TIMESTAMP THEN 'EXPIRED' ELSE status END AS status,COUNT(*) AS orders FROM retail_online_orders GROUP BY 1")};
}
