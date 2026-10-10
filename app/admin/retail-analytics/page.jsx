'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Download } from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency as currency } from '@/lib/currency';
import { nepalDateString } from '@/lib/report-dates';

const formatCurrency = value => value == null ? 'Restricted' : currency(value);

const TABS = [
  { id: 'dashboard', label: 'Executive Dashboard' },
  { id: 'sales', label: 'Sales' },
  { id: 'products', label: 'Product Performance' },
  { id: 'customers', label: 'Customers' },
  { id: 'promotions', label: 'Promotions' },
  { id: 'loyalty', label: 'Loyalty' },
  { id: 'returns', label: 'Returns' },
  { id: 'purchases', label: 'Purchases' },
];

function todayStr() { return nepalDateString(new Date()); }
function monthAgoStr() { return nepalDateString(new Date(Date.now() - 30 * 86400000)); }

function downloadCsv(filename, headers, rows) {
  const escape = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function RetailAnalyticsPage() {
  return <Suspense fallback={<AdminLayout><div role="status" className="p-6">Loading insights…</div></AdminLayout>}><RetailAnalyticsContent /></Suspense>;
}

function RetailAnalyticsContent() {
  const params = useSearchParams();
  const requested = params.get('tab');
  const [tab, setTab] = useState(() => TABS.some((item) => item.id === requested) ? requested : 'dashboard');
  const [from, setFrom] = useState(() => /^\d{4}-\d{2}-\d{2}$/.test(params.get('from') || '') ? params.get('from') : monthAgoStr());
  const [to, setTo] = useState(() => /^\d{4}-\d{2}-\d{2}$/.test(params.get('to') || '') ? params.get('to') : todayStr());

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Retail Analytics</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === t.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {t.label}
              </button>
            ))}
          </div>
          {tab !== 'loyalty' && (
            <div className="flex items-center gap-2 ml-auto">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
              <span className="text-gray-400 text-sm">to</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
          )}
        </div>

        {tab === 'dashboard' && <DashboardTab from={from} to={to} />}
        {tab === 'sales' && <SalesTab from={from} to={to} />}
        {tab === 'products' && <ProductsTab from={from} to={to} />}
        {tab === 'customers' && <CustomersTab from={from} to={to} />}
        {tab === 'promotions' && <PromotionsTab from={from} to={to} />}
        {tab === 'loyalty' && <LoyaltyTab />}
        {tab === 'returns' && <ReturnsTab from={from} to={to} />}
        {tab === 'purchases' && <PurchasesTab from={from} to={to} />}
      </div>
    </AdminLayout>
  );
}

function Panel({ children }) { return <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">{children}</div>; }
function Loading() { return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>; }
function Kpi({ label, value, tone }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-0.5 font-semibold tabular-nums ${tone === 'red' ? 'text-red-700' : tone === 'green' ? 'text-emerald-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}
function ExportButton({ onClick }) {
  return <button onClick={onClick} className="ml-auto flex items-center gap-1 text-sm text-blue-700 hover:underline"><Download className="w-4 h-4" /> Export CSV</button>;
}

function DashboardTab({ from, to }) {
  const [d, setD] = useState(undefined);
  useEffect(() => { apiJson(`/api/admin/retail-analytics?report=dashboard&from=${from}&to=${to}`).then(setD).catch(() => setD(null)); }, [from, to]);
  if (d === undefined) return <Loading />;
  if (!d) return <p className="text-sm text-gray-400">Could not load dashboard.</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <Kpi label="Gross Sales" value={formatCurrency(d.grossSales)} />
      <Kpi label="Discounts" value={formatCurrency(d.discount)} />
      <Kpi label="Net Sales" value={formatCurrency(d.netSales)} />
      <Kpi label="Returns" value={formatCurrency(d.returnValue)} tone="red" />
      <Kpi label="Net Revenue" value={formatCurrency(d.netRevenue)} tone="green" />
      <Kpi label="COGS" value={formatCurrency(d.cogs)} />
      <Kpi label="Gross Profit" value={formatCurrency(d.grossProfit)} tone="green" />
      <Kpi label="Margin %" value={d.marginPercent == null ? 'Restricted' : `${d.marginPercent}%`} />
      <Kpi label="Transactions" value={d.transactions} />
      <Kpi label="Avg Basket" value={formatCurrency(d.averageBasketValue)} />
      <Kpi label="Items/Txn" value={d.itemsPerTransaction} />
      <Kpi label="Inventory Value" value={formatCurrency(d.inventoryValue)} tone={d.inventoryReconciled ? 'green' : 'red'} />
      <Kpi label="Low Stock SKUs" value={d.lowStockCount} tone={d.lowStockCount ? 'red' : undefined} />
      <Kpi label="Out of Stock" value={d.outOfStockCount} tone={d.outOfStockCount ? 'red' : undefined} />
      <Kpi label="Expired Value" value={formatCurrency(d.expiredValue)} tone={d.expiredValue ? 'red' : undefined} />
      <Kpi label="Near-Expiry Batches" value={d.nearExpiryBatchCount} />
      <Kpi label="Supplier Payables" value={formatCurrency(d.supplierPayables)} />
      <Kpi label="Customer Receivables" value={formatCurrency(d.customerReceivables)} />
      <Kpi label="Cash Position" value={formatCurrency(d.cashPosition)} />
      <Kpi label="Store Credit Liability" value={formatCurrency(d.storeCreditLiability)} />
    </div>
  );
}

function SalesTab({ from, to }) {
  const [groupBy, setGroupBy] = useState('product');
  const [rows, setRows] = useState(undefined);
  const load = useCallback(() => {
    apiJson(`/api/admin/retail-analytics?report=sales&from=${from}&to=${to}&group_by=${groupBy}`).then((d) => setRows(d.rows || [])).catch(() => setRows([]));
  }, [from, to, groupBy]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
          {['product', 'variant', 'category', 'brand', 'cashier', 'customer', 'payment_method', 'day'].map((g) => <option key={g} value={g}>{g.replace(/_/g, ' ')}</option>)}
        </select>
        {rows?.length > 0 && <ExportButton onClick={() => downloadCsv(`sales-by-${groupBy}.csv`, ['Label', 'Gross', 'Discount', 'Net', 'COGS', 'Profit', 'Margin %', 'Qty', 'Txns'], rows.map((r) => [r.label, r.grossSales, r.discount, r.netSales, r.cogs, r.grossProfit, r.marginPercent, r.quantity, r.transactions]))} />}
      </div>
      <Panel>
        {rows === undefined ? <Loading /> : rows.length === 0 ? <p className="p-6 text-center text-sm text-gray-400">No sales in this range.</p> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr><th className="text-left px-4 py-2">{groupBy.replace(/_/g, ' ')}</th><th className="text-right px-4 py-2">Gross</th><th className="text-right px-4 py-2">Discount</th><th className="text-right px-4 py-2">Net</th><th className="text-right px-4 py-2">COGS</th><th className="text-right px-4 py-2">Profit</th><th className="text-right px-4 py-2">Margin</th><th className="text-right px-4 py-2">Qty</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-4 py-2">{r.label}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(r.grossSales)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(r.discount)}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(r.netSales)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(r.cogs)}</td>
                  <td className="px-4 py-2 text-right text-emerald-700">{formatCurrency(r.grossProfit)}</td>
                  <td className="px-4 py-2 text-right">{r.marginPercent == null ? 'Restricted' : `${r.marginPercent}%`}</td>
                  <td className="px-4 py-2 text-right">{r.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function RankTable({ title, rows, valueKey, valueLabel }) {
  return (
    <Panel>
      <h3 className="px-4 py-2 text-sm font-semibold text-gray-700 border-b border-gray-100">{title}</h3>
      {!rows?.length ? <p className="p-4 text-sm text-gray-400">No data.</p> : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-50">
                <td className="px-4 py-1.5">{r.label}</td>
                <td className="px-4 py-1.5 text-right font-medium">{valueKey === 'marginPercent' ? `${r[valueKey]}%` : formatCurrency(r[valueKey])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="sr-only">{valueLabel}</p>
    </Panel>
  );
}

function ProductsTab({ from, to }) {
  const [d, setD] = useState(undefined);
  useEffect(() => { apiJson(`/api/admin/retail-analytics?report=products&from=${from}&to=${to}`).then(setD).catch(() => setD(null)); }, [from, to]);
  if (d === undefined) return <Loading />;
  if (!d) return <p className="text-sm text-gray-400">Could not load.</p>;
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <RankTable title="Top Sellers (Revenue)" rows={d.topByRevenue} valueKey="netSales" />
      {d.topByProfit && <RankTable title="Top Sellers (Profit)" rows={d.topByProfit} valueKey="grossProfit" />}
      {d.topByMargin && <RankTable title="Highest Margin" rows={d.topByMargin} valueKey="marginPercent" />}
      <RankTable title="Bottom Sellers (Revenue)" rows={d.bottomByRevenue} valueKey="netSales" />
    </div>
  );
}

function CustomersTab({ from, to }) {
  const [d, setD] = useState(undefined);
  useEffect(() => { apiJson(`/api/admin/retail-analytics?report=customers&from=${from}&to=${to}`).then(setD).catch(() => setD(null)); }, [from, to]);
  if (d === undefined) return <Loading />;
  if (!d) return <p className="text-sm text-gray-400">Could not load.</p>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <Kpi label="New Customers" value={d.newCustomers} />
        <Kpi label="Top Customer Count" value={d.topByRevenue.length} />
      </div>
      <Panel>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="text-left px-4 py-2">Customer</th><th className="text-right px-4 py-2">Visits</th><th className="text-right px-4 py-2">Revenue</th><th className="text-right px-4 py-2">Profit</th><th className="text-right px-4 py-2">Avg Spend</th></tr></thead>
          <tbody>
            {d.topByRevenue.map((c) => (
              <tr key={c.customerId} className="border-t border-gray-100">
                <td className="px-4 py-2">{c.name}</td>
                <td className="px-4 py-2 text-right">{c.visits}</td>
                <td className="px-4 py-2 text-right font-medium">{formatCurrency(c.revenue)}</td>
                <td className="px-4 py-2 text-right text-emerald-700">{formatCurrency(c.grossProfit)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(c.averageSpend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function PromotionsTab({ from, to }) {
  const [rows, setRows] = useState(undefined);
  useEffect(() => { apiJson(`/api/admin/retail-analytics?report=promotions&from=${from}&to=${to}`).then((d) => setRows(d.rows || [])).catch(() => setRows([])); }, [from, to]);
  return (
    <Panel>
      {rows === undefined ? <Loading /> : rows.length === 0 ? <p className="p-6 text-center text-sm text-gray-400">No promotion redemptions in this range.</p> : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="text-left px-4 py-2">Promotion</th><th className="text-right px-4 py-2">Uses</th><th className="text-right px-4 py-2">Discount Given</th><th className="text-right px-4 py-2">Gross Sales Influenced</th><th className="text-right px-4 py-2">Avg Basket</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.promotionId} className="border-t border-gray-100">
                <td className="px-4 py-2">{r.name}{r.code ? ` (${r.code})` : ''}</td>
                <td className="px-4 py-2 text-right">{r.uses}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(r.discountGiven)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(r.grossSalesInfluenced)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(r.averageBasket)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function LoyaltyTab() {
  const [d, setD] = useState(undefined);
  useEffect(() => { apiJson('/api/admin/retail-analytics?report=loyalty').then(setD).catch(() => setD(null)); }, []);
  if (d === undefined) return <Loading />;
  if (!d) return <p className="text-sm text-gray-400">Could not load.</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <Kpi label="Active Loyalty Customers" value={d.activeLoyaltyCustomers} />
      <Kpi label="Points Issued" value={d.pointsIssued} />
      <Kpi label="Points Redeemed" value={d.pointsRedeemed} />
      <Kpi label="Points Outstanding" value={d.pointsOutstanding} />
      <Kpi label="Redemption Rate" value={`${d.redemptionRate}%`} />
      <Kpi label="Sales Involving Loyalty" value={d.salesInvolvingLoyalty} />
    </div>
  );
}

function ReturnsTab({ from, to }) {
  const [d, setD] = useState(undefined);
  useEffect(() => { apiJson(`/api/admin/retail-analytics?report=returns&from=${from}&to=${to}`).then(setD).catch(() => setD(null)); }, [from, to]);
  if (d === undefined) return <Loading />;
  if (!d) return <p className="text-sm text-gray-400">Could not load.</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Return Value" value={formatCurrency(d.returnValue)} tone="red" />
        <Kpi label="Return Count" value={d.returnCount} />
        <Kpi label="Return Rate" value={`${d.returnRate}%`} />
        <Kpi label="Resellable Qty" value={d.resellableQuantity} tone="green" />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Panel>
          <h3 className="px-4 py-2 text-sm font-semibold text-gray-700 border-b border-gray-100">By Reason</h3>
          {d.byReason.map((r, i) => <div key={i} className="flex justify-between px-4 py-1.5 text-sm border-t border-gray-50"><span>{r.reason}</span><span>{formatCurrency(r.value)}</span></div>)}
        </Panel>
        <Panel>
          <h3 className="px-4 py-2 text-sm font-semibold text-gray-700 border-b border-gray-100">By Refund Method</h3>
          {d.byRefundMethod.map((r, i) => <div key={i} className="flex justify-between px-4 py-1.5 text-sm border-t border-gray-50"><span className="capitalize">{r.method}</span><span>{formatCurrency(r.value)}</span></div>)}
        </Panel>
      </div>
      <RankTable title="Most Returned Products" rows={d.mostReturned.map((r) => ({ label: r.product, ...r }))} valueKey="value" />
    </div>
  );
}

function PurchasesTab({ from, to }) {
  const [d, setD] = useState(undefined);
  useEffect(() => { apiJson(`/api/admin/retail-analytics?report=purchases&from=${from}&to=${to}`).then(setD).catch(() => setD(null)); }, [from, to]);
  if (d === undefined) return <Loading />;
  if (!d) return <p className="text-sm text-gray-400">Could not load.</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Kpi label="Total Purchases" value={formatCurrency(d.totalPurchases)} />
        <Kpi label="Purchase Returns" value={formatCurrency(d.purchaseReturns)} />
        <Kpi label="Supplier Payables" value={formatCurrency(d.supplierPayables)} />
      </div>
      <Panel>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="text-left px-4 py-2">Supplier</th><th className="text-right px-4 py-2">Receipts</th><th className="text-right px-4 py-2">Value</th><th className="text-right px-4 py-2">Avg Cost</th></tr></thead>
          <tbody>
            {d.bySupplier.map((s, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-4 py-2">{s.supplier}</td>
                <td className="px-4 py-2 text-right">{s.receipts}</td>
                <td className="px-4 py-2 text-right font-medium">{formatCurrency(s.value)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(s.averageCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
