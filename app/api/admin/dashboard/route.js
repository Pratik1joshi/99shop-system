import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth } from '@/lib/api-guard.js';
import { cashSafePayload } from '@/lib/cash-closing-policy.js';
import { currentBusinessDay } from '@/lib/business-days.js';
import { getExecutiveDashboard, getSalesByDimension } from '@/lib/retail-analytics.js';
import { getLowStock, getOutOfStock } from '@/lib/retail-inventory-reports.js';
import { getExpiringStock } from '@/lib/retail-inventory.js';
import { nepalDateString, formatNepalDateTime } from '@/lib/report-dates.js';

const n = (value) => Number(value) || 0;
function dayOffset(iso, offset) {
  const d = new Date(`${iso}T12:00:00+05:45`);
  d.setUTCDate(d.getUTCDate() + offset);
  return nepalDateString(d);
}

/** Owner dashboard: sales, stock, purchases and cash for the selected period. */
export async function GET(request) {
  let user = null;
  try {
    // This legacy aggregate includes historical COGS, profit, AP and stock value.
    // Cashiers use their counter dashboard and must not receive these fields.
    const auth = await requireAuth(request, { roles: ['admin', 'manager'], permission: 'dashboard.view' });
    if (auth.error) return auth.error;
    user = auth.user;
    const db = Database.getInstance();
    const today = nepalDateString(new Date());
    const yesterday = dayOffset(today, -1);
    const weekStart = dayOffset(today, -6);
    const businessDay = await currentBusinessDay(db);

    const [current, previous, lowStock, outOfStock, expiry, topItems, held, paymentRows, cashier, activitySales, activityStock] = await Promise.all([
      getExecutiveDashboard(db, { from: today, to: today }),
      getExecutiveDashboard(db, { from: yesterday, to: yesterday }),
      getLowStock(db), getOutOfStock(db), getExpiringStock(db, 90),
      getSalesByDimension(db, { from: today, to: today, groupBy: 'product' }),
      db.get(`SELECT COUNT(*) AS count, COALESCE(SUM(grand_total),0) AS value FROM retail_sales WHERE status='HELD'`),
      db.all(`SELECT LOWER(p.method) AS method, COALESCE(SUM(p.amount),0) AS total, COUNT(*) AS count
                FROM retail_sale_payments p JOIN retail_sales s ON s.id=p.retail_sale_id
               WHERE s.status='COMPLETED' AND s.completed_at>=? AND s.completed_at<=?
               GROUP BY LOWER(p.method)`, [today, `${today} 23:59:59`]),
      db.get(`SELECT COALESCE(u.full_name,u.username,'Unknown') AS name, COUNT(*) AS count
                FROM retail_sales s LEFT JOIN users u ON u.id=s.cashier_id
               WHERE s.status='COMPLETED' AND s.completed_at>=? AND s.completed_at<=?
               GROUP BY u.id,u.full_name,u.username ORDER BY count DESC LIMIT 1`, [today, `${today} 23:59:59`]),
      db.all(`SELECT sale_number, grand_total, completed_at AS at FROM retail_sales WHERE status='COMPLETED' ORDER BY completed_at DESC LIMIT 12`),
      db.all(`SELECT m.movement_type, m.quantity, m.created_at AS at, mi.name AS product_name, v.variant_name
                FROM inventory_movements m JOIN menu_item_variants v ON v.id=m.variant_id JOIN menu_items mi ON mi.id=v.menu_item_id
               ORDER BY m.created_at DESC LIMIT 12`),
    ]);

    const trendRows = await db.all(
      `SELECT date(completed_at) AS day, COUNT(*) AS count, COALESCE(SUM(grand_total-tax_amount),0) AS value
         FROM retail_sales WHERE status='COMPLETED' AND completed_at>=? AND completed_at<=?
        GROUP BY date(completed_at) ORDER BY day`, [weekStart, `${today} 23:59:59`]
    );
    const trendMap = new Map(trendRows.map((row) => [row.day, row]));
    const revenueTrend = [];
    const orderVolume = [];
    for (let i = -6; i <= 0; i++) {
      const date = dayOffset(today, i);
      const row = trendMap.get(date) || {};
      const day = new Date(`${date}T12:00:00+05:45`).toLocaleDateString('en-US', { timeZone: 'Asia/Kathmandu', weekday: 'short' });
      revenueTrend.push({ day, date, value: n(row.value) });
      orderVolume.push({ day, date, value: n(row.count) });
    }
    const paymentTotal = paymentRows.reduce((sum, row) => sum + n(row.total), 0);
    const paymentMix = paymentRows.map((row) => ({ method: row.method, total: n(row.total), count: n(row.count), pct: paymentTotal ? Math.round(n(row.total) / paymentTotal * 100) : 0 }));
    const needsAttention = [
      ...outOfStock.slice(0, 3).map((item) => ({ type: 'out_of_stock', text: `${item.productName}${item.variantName ? ` / ${item.variantName}` : ''}: out of stock`, href: '/admin/retail-inventory' })),
      ...lowStock.slice(0, 3).map((item) => ({ type: 'low_stock', text: `${item.productName}${item.variantName ? ` / ${item.variantName}` : ''}: ${n(item.sellableStock)} sellable`, href: '/admin/retail-inventory' })),
      ...expiry.slice(0, 4).map((item) => ({ type: 'expiry', text: `Expiry risk: ${item.product_name || 'Product'} batch ${item.batch_number || ''}`, href: '/admin/retail-inventory' })),
    ];
    const activity = [
      ...activitySales.map((row) => ({ type: 'sale_completed', text: `Sale ${row.sale_number} completed · Rs ${n(row.grand_total).toFixed(2)}`, at: row.at })),
      ...activityStock.map((row) => ({ type: row.movement_type, text: `${row.movement_type.replaceAll('_', ' ')}: ${row.product_name}${row.variant_name ? ` / ${row.variant_name}` : ''} (${n(row.quantity)})`, at: row.at })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 20).map((row) => ({ ...row, atLabel: formatNepalDateTime(row.at) }));
    const top = topItems.slice(0, 8).map((row) => ({ name: row.label, qty: row.quantity, revenue: row.netSales }));

    const stats = {
      today, businessDay: businessDay ? { id: businessDay.id, businessDate: businessDay.business_date, openedAt: businessDay.opened_at, openingCash: n(businessDay.opening_cash) } : null,
      kpis: {
        sales: { value: current.netSales, prev: previous.netSales }, grossSales: { value: current.grossSales },
        returns: { value: current.returnValue, count: current.returnCount }, orders: { value: current.transactions, prev: previous.transactions },
        profit: { value: current.grossProfit, prev: previous.grossProfit, note: 'Net Sales − historical COGS' },
        avgTicket: { value: current.averageBasketValue, paidBills: current.transactions }, openCartValue: { value: n(held.value) },
        activeOrders: { value: n(held.count) }, openBills: { value: 0 }, reopenedBills: { value: 0 },
        creditOutstanding: { value: current.customerReceivables }, refundsToday: { value: current.returnValue, count: current.returnCount },
        discountsToday: { value: current.discount }, vat: { value: current.tax }, cogs: { value: current.cogs },
        cash: { value: current.cashPayments }, digital: { value: current.digitalPayments }, creditSales: { value: current.customerCreditSales },
        payables: { value: current.supplierPayables }, inventoryValue: { value: current.inventoryValue }, lowStock: { value: current.lowStockCount }, expiryRisk: { value: current.nearExpiryBatchCount },
      },
      needsAttention, activity, revenueTrend, orderVolume, paymentMix, hourlySales: [], topItems: top,
      performance: { topItem: top[0] ? { name: top[0].name, qty: top[0].qty } : null, bestEmployee: cashier ? { name: cashier.name, orders: n(cashier.count) } : null },
      inventorySnapshot: lowStock.slice(0, 8).map((item) => ({ name: `${item.productName}${item.variantName ? ` / ${item.variantName}` : ''}`, qty: n(item.sellableStock), unit: '', status: n(item.sellableStock) <= 0 ? 'out' : 'low' })),
    };
    return NextResponse.json(cashSafePayload({ stats }, user));
  } catch (error) {
    console.error('Retail dashboard stats error:', error);
    return NextResponse.json(cashSafePayload({ error: 'Failed to fetch dashboard stats' }, user), { status: 500 });
  }
}
