/**
 * Canonical Retail reporting adapter.
 *
 * Financial definitions live in retail-analytics.js and are reused here and
 * by the dashboard. This adapter only shapes canonical rows for the legacy
 * report UI; it never reads restaurant orders/bills/KOTs or legacy stock.
 */
import {
  getExecutiveDashboard, getSalesByDimension, getCustomerAnalytics,
  getPurchaseAnalytics, getReturnsAnalytics,
} from '@/lib/retail-analytics.js';

const n = (value) => Number(value) || 0;
const money = (key, label, value, hint) => ({ key, label, value: n(value), format: 'currency', hint });
const table = (id, title, columns, rows, empty = 'No canonical retail records match this period.') => ({ id, title, columns, rows, empty });

function saleWhere(range, filters, alias = 's') {
  const clauses = [`${alias}.status='COMPLETED'`];
  const params = [];
  if (filters.businessDayId) { clauses.push(`${alias}.business_day_id=?`); params.push(filters.businessDayId); }
  else { clauses.push(`${alias}.completed_at>=?`, `${alias}.completed_at<=?`); params.push(range.start, `${range.end} 23:59:59`); }
  if (filters.employeeId) { clauses.push(`${alias}.cashier_id=?`); params.push(filters.employeeId); }
  if (filters.paymentMethod) { clauses.push(`EXISTS (SELECT 1 FROM retail_sale_payments rp WHERE rp.retail_sale_id=${alias}.id AND LOWER(rp.method)=LOWER(?))`); params.push(filters.paymentMethod); }
  if (filters.search) { clauses.push(`(${alias}.sale_number LIKE ? OR COALESCE(c.name,'') LIKE ?)`); params.push(`%${filters.search}%`, `%${filters.search}%`); }
  return { sql: clauses.join(' AND '), params };
}

async function salesReport(db, range, filters) {
  const scoped = Boolean(filters.businessDayId || filters.employeeId || filters.paymentMethod || filters.search);
  const summary = scoped ? null : await getExecutiveDashboard(db, { from: range.start, to: range.end });
  const where = saleWhere(range, filters);
  const paymentList = db.driver === 'postgres'
    ? `(SELECT STRING_AGG(p.method, ', ' ORDER BY p.id) FROM retail_sale_payments p WHERE p.retail_sale_id=s.id)`
    : `(SELECT GROUP_CONCAT(p.method, ', ') FROM retail_sale_payments p WHERE p.retail_sale_id=s.id)`;
  const rows = await db.all(
    `SELECT s.id AS _record_id,s.completed_at AS created_at,s.sale_number,s.status,
            COALESCE(c.name,'Walk-in') AS customer_name,COALESCE(u.full_name,u.username,'Unknown') AS cashier,
            s.subtotal,s.discount_amount,s.tax_amount,s.grand_total,s.cogs_total,
            (s.grand_total-s.tax_amount) AS net_sales,
            ((s.grand_total-s.tax_amount)-s.cogs_total) AS gross_profit,
            ${paymentList} AS payment
       FROM retail_sales s LEFT JOIN customers c ON c.id=s.customer_id LEFT JOIN users u ON u.id=s.cashier_id
      WHERE ${where.sql} ORDER BY s.completed_at DESC${filters.exportAll ? '' : ' LIMIT 1001'}`, where.params
  );
  return {
    notes: [
      ...(scoped ? ['Summary cards are unavailable for these filters; the table shows matching completed sales.'] : []),
      ...(!filters.exportAll && rows.length > 1000 ? ['Showing the latest 1,000 sales. Export includes all matching records.'] : []),
      'Per-sale amounts are checkout snapshots; period totals account for posted returns.',
    ],
    kpis: summary ? [
      money('gross', 'Gross Sales', summary.grossSales, 'Before discounts, returns and VAT.'),
      money('discounts', 'Discounts', summary.discount), money('returns', 'Returns', summary.returnValue),
      money('net', 'Net Sales', summary.netSales, 'Gross sales less discounts and returned revenue, excluding VAT.'),
      money('vat', 'VAT', summary.tax), money('cogs', 'COGS', summary.cogs, 'Historical sale COGS less physically restored return COGS.'),
      money('profit', 'Gross Profit', summary.grossProfit, 'Net Sales minus historical COGS.'),
    ] : [],
    tables: [table('transactions', 'Retail Sales', [
      { key: 'created_at', label: 'Date', type: 'datetime' }, { key: 'sale_number', label: 'Sale' },
      { key: 'customer_name', label: 'Customer' }, { key: 'cashier', label: 'Cashier' }, { key: 'payment', label: 'Payment', type: 'badge' },
      { key: 'net_sales', label: 'Net Sales', type: 'currency', align: 'right' }, { key: 'tax_amount', label: 'VAT', type: 'currency', align: 'right' },
      { key: 'cogs_total', label: 'COGS', type: 'currency', align: 'right' }, { key: 'gross_profit', label: 'Gross Profit', type: 'currency', align: 'right' },
      { key: 'grand_total', label: 'Total', type: 'currency', align: 'right' },
    ], filters.exportAll ? rows : rows.slice(0, 1000))],
  };
}

async function inventoryReport(db) {
  const rows = await db.all(
    `SELECT mi.name AS item_name,v.variant_name,v.sku,l.name AS location,
            b.quantity_on_hand AS quantity,v.stock_unit AS unit,v.reorder_point AS min_level,
            COALESCE(ic.average_cost,0) AS average_cost,b.allocated_value AS value,
            CASE WHEN b.quantity_on_hand<=0 THEN 'out of stock' WHEN b.quantity_on_hand<=COALESCE(v.reorder_point,0) THEN 'low' ELSE 'ok' END AS stock_status
       FROM inventory_balance_valuation b JOIN menu_item_variants v ON v.id=b.variant_id
       JOIN menu_items mi ON mi.id=v.menu_item_id JOIN inventory_locations l ON l.id=b.location_id
       LEFT JOIN inventory_costs ic ON ic.variant_id=b.variant_id
      ORDER BY mi.name,v.variant_name,l.name`
  );
  return { tables: [table('inventory', 'Inventory Balance Projection', [
    { key: 'item_name', label: 'Product' }, { key: 'variant_name', label: 'Variant' }, { key: 'sku', label: 'SKU' }, { key: 'location', label: 'Location' },
    { key: 'quantity', label: 'On Hand', type: 'number', align: 'right' }, { key: 'unit', label: 'Unit' }, { key: 'average_cost', label: 'Average Cost', type: 'currency', align: 'right' },
    { key: 'value', label: 'Value', type: 'currency', align: 'right' }, { key: 'stock_status', label: 'Status', type: 'badge' },
  ], rows)] };
}

async function dimensionReport(db, range, groupBy, id, title) {
  const rows = await getSalesByDimension(db, { from: range.start, to: range.end, groupBy });
  return { tables: [table(id, title, [
    { key: 'label', label: title.replace(/ Performance$/, '') }, { key: 'quantity', label: 'Quantity', type: 'number', align: 'right' },
    { key: 'grossSales', label: 'Gross Sales', type: 'currency', align: 'right' }, { key: 'discount', label: 'Discount', type: 'currency', align: 'right' },
    { key: 'netSales', label: 'Net Sales', type: 'currency', align: 'right' }, { key: 'cogs', label: 'COGS', type: 'currency', align: 'right' },
    { key: 'grossProfit', label: 'Gross Profit', type: 'currency', align: 'right' }, { key: 'marginPercent', label: 'Margin %', type: 'number', align: 'right' },
  ], rows)] };
}

async function purchasesReport(db, range) {
  const analytics = await getPurchaseAnalytics(db, { from: range.start, to: range.end });
  const rows = await db.all(
    `SELECT g.id AS _record_id,g.posted_at AS recorded_at,COALESCE(g.invoice_date,g.receipt_date) AS invoice_date,
            COALESCE(g.invoice_number,g.grn_number) AS invoice_number,g.payment_method,g.status,
            sup.name AS supplier,COALESCE(SUM(gl.net_amount),0) AS total
       FROM goods_receipts g JOIN suppliers sup ON sup.id=g.supplier_id JOIN goods_receipt_lines gl ON gl.goods_receipt_id=g.id
      WHERE g.status='POSTED' AND g.posted_at>=? AND g.posted_at<=?
      GROUP BY g.id,g.posted_at,g.invoice_date,g.receipt_date,g.invoice_number,g.grn_number,g.payment_method,g.status,sup.name ORDER BY g.posted_at DESC`, [range.start, `${range.end} 23:59:59`]
  );
  return { kpis: [money('purchases', 'Posted Receipts', analytics.totalPurchases), money('purchase_returns', 'Purchase Returns', analytics.purchaseReturns)], tables: [table('purchases', 'Goods Receipts', [
    { key: 'invoice_date', label: 'Invoice Date', type: 'date' }, { key: 'invoice_number', label: 'Receipt' }, { key: 'supplier', label: 'Supplier' }, { key: 'payment_method', label: 'Payment' }, { key: 'status', label: 'Status', type: 'badge' }, { key: 'total', label: 'Total', type: 'currency', align: 'right' },
  ], rows)] };
}

async function customersReport(db, range) {
  const result = await getCustomerAnalytics(db, { from: range.start, to: range.end, limit: 200 });
  return { tables: [table('detail', 'Customer Performance', [
    { key: 'name', label: 'Customer' }, { key: 'visits', label: 'Sales', type: 'number' }, { key: 'revenue', label: 'Net Revenue', type: 'currency' }, { key: 'grossProfit', label: 'Gross Profit', type: 'currency' }, { key: 'averageSpend', label: 'Average Spend', type: 'currency' },
  ], result.topByRevenue)] };
}

async function changesReport(db, range) {
  const result = await getReturnsAnalytics(db, { from: range.start, to: range.end });
  return { kpis: [money('returns', 'Returns', result.returnValue)], tables: [table('voids-refunds', 'Retail Returns', [
    { key: 'reason', label: 'Reason' }, { key: 'count', label: 'Lines', type: 'number' }, { key: 'value', label: 'Refund Value', type: 'currency' },
  ], result.byReason)] };
}

export async function buildRetailReport(db, tabName, range, filters = {}) {
  const tab = tabName === 'overview' ? 'sales' : tabName;
  if (tab === 'sales' || tab === 'orders' || tab === 'finance') return salesReport(db, range, filters);
  if (tab === 'inventory') return inventoryReport(db);
  if (tab === 'menu') return dimensionReport(db, range, 'product', 'detail', 'Product Performance');
  if (tab === 'categories') return dimensionReport(db, range, 'category', 'category-summary', 'Category Performance');
  if (tab === 'employees') return dimensionReport(db, range, 'cashier', 'detail', 'Cashier Performance');
  if (tab === 'customers') return customersReport(db, range);
  if (tab === 'purchases') return purchasesReport(db, range);
  if (tab === 'suppliers') {
    const result = await getPurchaseAnalytics(db, { from: range.start, to: range.end });
    return { tables: [table('supplier-ledger', 'Supplier Purchases', [
      { key: 'supplier', label: 'Supplier' }, { key: 'receipts', label: 'Receipts', type: 'number' }, { key: 'value', label: 'Purchases', type: 'currency' }, { key: 'averageCost', label: 'Average Unit Cost', type: 'currency' },
    ], result.bySupplier)] };
  }
  if (tab === 'changes') return changesReport(db, range);
  if (tab === 'expenses') {
    const rows = await db.all(`SELECT id AS _record_id,COALESCE(purchase_date,CAST(expense_date AS TEXT)) AS spent_on,description,category,amount,payment_method,status FROM expenses WHERE source_type IS NULL AND LOWER(COALESCE(status,'active'))<>'voided' AND COALESCE(purchase_date,CAST(expense_date AS TEXT))>=? AND COALESCE(purchase_date,CAST(expense_date AS TEXT))<=? ORDER BY spent_on DESC`, [range.start, range.end]);
    return { tables: [table('ledger', 'Active Operating Expenses', [{ key: 'spent_on', label: 'Date', type: 'date' }, { key: 'description', label: 'Description' }, { key: 'category', label: 'Category' }, { key: 'payment_method', label: 'Payment' }, { key: 'amount', label: 'Amount', type: 'currency' }], rows)] };
  }
  return salesReport(db, range, filters);
}

export async function getRetailReportFilterOptions(db) {
  const [employees, categories, businessDays] = await Promise.all([
    db.all(`SELECT id,full_name,username,role FROM users WHERE COALESCE(is_active,1)=1 AND role IN ('admin','cashier') ORDER BY full_name`),
    db.all(`SELECT id,name FROM menu_categories ORDER BY name`),
    db.all(`SELECT id,business_date,status FROM business_days ORDER BY business_date DESC,id DESC LIMIT 120`),
  ]);
  return {
    employees: employees.map((row) => ({ id: row.id, name: row.full_name || row.username, role: row.role })),
    categories, masterCategories: [], paymentMethods: ['cash', 'online', 'credit', 'store_credit'],
    orderTypes: [], businessDays,
  };
}

export function retailSupportedFilters(tab) {
  if (['sales', 'orders', 'finance'].includes(tab)) return ['businessDayId', 'employeeId', 'paymentMethod', 'search'];
  return [];
}
