import { ensureProductCatalogSchema } from '@/lib/product-catalog.js';
import { getExecutiveDashboard, getSalesByDimension } from '@/lib/retail-analytics.js';
import { getLowStock, getOutOfStock } from '@/lib/retail-inventory-reports.js';
import { getExpiringStock } from '@/lib/retail-inventory.js';
import { accountBalance, ensureAccountingSchema } from '@/lib/accounting.js';
import { businessDayContext, ensureBusinessDaySchema } from '@/lib/business-days.js';
import { runRetailReconciliation } from '@/lib/retail-reconciliation.js';
import { nepalDateString } from '@/lib/report-dates.js';
import { listCashVariances } from '@/lib/cash-variance-review.js';
import { ensureRetailOnlineOrderSchema } from '@/lib/retail-online-orders.js';
import { ensureRetailSalesSchema } from '@/lib/retail-sales.js';
import { ensureRetailReturnsSchema } from '@/lib/retail-returns.js';

export const OVERVIEW_METRICS = Object.freeze({
  netSales: { label: 'Net sales', scope: 'Today', definition: 'Gross Retail sales less discounts and returned revenue, excluding VAT.', href: '/admin/retail-analytics?tab=dashboard&from={date}&to={date}' },
  grossProfit: { label: 'Gross profit', scope: 'Today', definition: 'Net sales less historical sale COGS, including posted return reversals.', href: '/admin/retail-analytics?tab=dashboard&from={date}&to={date}' },
  cashBalance: { label: 'Cash balance', scope: 'Current ledger', definition: 'Posted balance of the Cash account. This is a position, not today’s takings.', href: '/admin/retail-registers' },
  digitalPayments: { label: 'Digital takings', scope: 'Today', definition: 'Completed Retail sale payments recorded as online. Refunds and supplier payments are separate.', href: '/admin/retail-sales-history' },
  receivables: { label: 'Receivables', scope: 'Current ledger', definition: 'Posted Accounts Receivable balance, including customer tagged entries.', href: '/admin/retail-receivables' },
  payables: { label: 'Payables', scope: 'Current ledger', definition: 'Posted Accounts Payable liability balance.', href: '/admin/accounts-payable' },
  inventoryValue: { label: 'Inventory value', scope: 'Current stock', definition: 'Quantity on hand valued at canonical moving average cost.', href: '/admin/retail-inventory' },
  returns: { label: 'Returns', scope: 'Today', definition: 'Total refund amount on posted Retail returns today, including VAT.', href: '/admin/retail-returns' },
});

const amount = (value) => Math.round((Number(value) || 0) * 100) / 100;
const issue = (type, severity, title, explanation, href, sourceId = null) => ({
  id: `${type}:${sourceId ?? 'all'}`, type, severity, title, explanation, href,
  sourceId, status: 'open',
});

export function buildOverviewAttention({ lowStock = [], outOfStock = [], expiring = [], overdue = {}, day = {}, reconciliation = {} }) {
  const items = [];
  if (reconciliation.reconciled === false) items.push(issue('reconciliation', 'critical', 'Reconciliation exception', 'A posted ledger or inventory projection differs from its source.', '/admin/retail-reconciliation'));
  if (day.isStale && !day.staleAcknowledged) items.push(issue('stale_register', 'high', 'Register needs review', 'The active business day is stale.', '/admin/retail-registers'));
  if (Number(overdue.count) > 0) items.push(issue('overdue_receivables', 'high', `${overdue.count} overdue credit sales`, `${amount(overdue.amount).toFixed(2)} remains open on Retail sales older than 30 days.`, '/admin/retail-receivables'));
  if (outOfStock.length) items.push(issue('out_of_stock', 'high', `${outOfStock.length} out of stock`, 'Sellable stock is zero for items with a reorder point.', '/admin/retail-inventory?state=OUT'));
  if (lowStock.length) items.push(issue('low_stock', 'medium', `${lowStock.length} low stock`, 'Available stock plus approved incoming quantity is at or below the reorder point.', '/admin/retail-replenishment'));
  if (expiring.length) items.push(issue('expiring', 'medium', `${expiring.length} expiring batches`, 'Active batches with stock expire within 30 days.', '/admin/retail-inventory?state=EXPIRING'));
  return items;
}

/** Keep displayed destinations within each role's actual Retail permissions. */
export function overviewForRole(overview, role, cashVisible, can=()=>true) {
  const permissionByMetric={grossProfit:'retail_sale.view_profit',inventoryValue:'retail_inventory.view_cost',payables:'supplier_ledger.access',receivables:'customer_ledger.access'};
  for(const metric of overview.metrics)if(permissionByMetric[metric.key]&&!can(permissionByMetric[metric.key])){metric.value=null;metric.definition='This financial metric is restricted for your role.';metric.href=null;}
  if (role === 'manager') {
    const payables = overview.metrics.find((metric) => metric.key === 'payables');
    if (payables) payables.href = '/admin/retail-finance';
    overview.attention.forEach((item) => {
      if (item.type === 'reconciliation') item.href = '/admin/retail-finance';
      if (item.type === 'low_stock') item.href = '/admin/retail-inventory?state=LOW';
    });
    overview.reconciliation.href = '/admin/retail-finance';
  }
  if (!cashVisible) {
    const cash = overview.metrics.find((metric) => metric.key === 'cashBalance');
    if (cash) { cash.value = null; cash.definition = 'Cash balance is available after the configured reveal time.'; }
  }
  if(!can('retail_online_orders.view'))overview.attention=overview.attention.filter(item=>item.type!=='online_orders');
  return overview;
}

export async function getRetailOverview(db) {
  // Upgrade local SQLite before any parallel reader uses online-order columns.
  await ensureBusinessDaySchema(db);
  await ensureProductCatalogSchema(db);
  await ensureAccountingSchema(db);
  await ensureRetailOnlineOrderSchema(db);
  await ensureRetailSalesSchema(db);
  await ensureRetailReturnsSchema(db);
  const today = nepalDateString(new Date());
  const trendStartDate = new Date(`${today}T12:00:00+05:45`);
  trendStartDate.setDate(trendStartDate.getDate() - 13);
  const trendStart = nepalDateString(trendStartDate);
  const cutoff = new Date().toISOString();
  const overdueBefore = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const [summary, cash, lowStock, outOfStock, expiring, overdue, day, reconciliation, activity, cashVariances, onlineOrders, salesByDay, salesByCategory] = await Promise.all([
    getExecutiveDashboard(db, { from: today, to: today }),
    accountBalance(db, '1010'), getLowStock(db), getOutOfStock(db), getExpiringStock(db, 30),
    db.get(`SELECT COUNT(*) AS count, COALESCE(SUM(amount_due),0) AS amount FROM retail_sales WHERE status='COMPLETED' AND amount_due>0.005 AND completed_at<?`, [overdueBefore]),
    businessDayContext(db), runRetailReconciliation(db),
    db.all(`SELECT id,sale_number,completed_at,grand_total FROM retail_sales WHERE status='COMPLETED' ORDER BY completed_at DESC,id DESC LIMIT 8`),
    listCashVariances(db),
    db.get("SELECT COUNT(*) AS count FROM retail_online_orders WHERE status IN ('PENDING','CONFIRMED','READY') AND (reservation_expires_at IS NULL OR reservation_expires_at>CURRENT_TIMESTAMP)"),
    getSalesByDimension(db, { from: trendStart, to: today, groupBy: 'day' }),
    getSalesByDimension(db, { from: trendStart, to: today, groupBy: 'category' }),
  ]);
  const salesDays = new Map(salesByDay.map((row) => [row.label, row]));
  const salesTrend = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(`${trendStart}T12:00:00+05:45`);
    date.setDate(date.getDate() + index);
    const dayKey = nepalDateString(date);
    return { label: dayKey.slice(5), sub: dayKey, value: salesDays.get(dayKey)?.netSales || 0 };
  });
  const values = {
    netSales: summary.netSales, grossProfit: summary.grossProfit, cashBalance: cash,
    digitalPayments: summary.digitalPayments, receivables: summary.customerReceivables,
    payables: summary.supplierPayables, inventoryValue: summary.inventoryValue, returns: summary.returnValue,
  };
  return {
    businessDate: today, cutoff, register: { open: !!day.activeSession, stale: !!day.isStale && !day.staleAcknowledged },
    reconciliation: { healthy: reconciliation.reconciled, failedChecks: reconciliation.checks.filter((check) => !check.reconciled).length + reconciliation.inventoryProjection.differences.length, href: '/admin/retail-reconciliation' },
    metrics: Object.entries(OVERVIEW_METRICS).map(([key, definition]) => ({ key, ...definition, href: definition.href.replaceAll('{date}', today), value: amount(values[key]), cutoff })),
    charts: {
      salesTrend,
      hasSales: salesByDay.some((row) => row.transactions || row.returnCount),
      categories: salesByCategory.filter((row) => row.netSales > 0).sort((a, b) => b.netSales - a.netSales).slice(0, 6).map((row) => ({ label: row.label, value: row.netSales })),
    },
    attention: [...(Number(onlineOrders.count)?[issue('online_orders','medium',`${onlineOrders.count} online orders need attention`,'New, confirmed or ready orders. Orders are not recognized sales.','/admin/retail-online-orders')]:[]),...buildOverviewAttention({ lowStock, outOfStock, expiring, overdue, day, reconciliation }),
      ...(cashVariances.variances.length ? [issue('cash_variance','medium','Cash differences need review','Closed sessions have an unreviewed recorded difference of at least Rs 0.01.','/admin/retail-cash-variances')] : [])],
    inventory: { lowStock: lowStock.slice(0, 5).map(({ variantId, productName, variantName, available, reorderPoint }) => ({ variantId, productName, variantName, available, reorderPoint })) },
    activity: activity.map(({ id, sale_number, completed_at, grand_total }) => ({ id, number: sale_number, at: completed_at, total: amount(grand_total), href: `/admin/retail-sales-history/${id}` })),
  };
}
