'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';

const TABS = [
  { id: 'reorder', label: 'Reorder Suggestions' },
  { id: 'expiry', label: 'Expiring / Expired' },
  { id: 'movement', label: 'Fast / Slow / Dead Stock' },
  { id: 'valuation', label: 'Valuation' },
  { id: 'ageing', label: 'Ageing' },
  { id: 'ledger', label: 'Movement Ledger' },
];

export default function RetailInventoryReportsPage() {
  const [tab, setTab] = useState('reorder');
  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Inventory Reports</h1>
        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === t.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'reorder' && <ReorderTab />}
        {tab === 'expiry' && <ExpiryTab />}
        {tab === 'movement' && <MovementAnalysisTab />}
        {tab === 'valuation' && <ValuationTab />}
        {tab === 'ageing' && <AgeingTab />}
        {tab === 'ledger' && <LedgerTab />}
      </div>
    </AdminLayout>
  );
}

function Panel({ children }) { return <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">{children}</div>; }
function Loading() { return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>; }
function Empty({ text }) { return <div className="text-center text-sm text-gray-400 py-10">{text}</div>; }

function ReorderTab() {
  const [rows, setRows] = useState(undefined);
  useEffect(() => { apiJson('/api/admin/retail-inventory-reports/reorder').then((d) => setRows(d.suggestions || [])).catch(() => setRows([])); }, []);
  return (
    <Panel>
      {rows === undefined ? <Loading /> : rows.length === 0 ? <Empty text="Nothing needs reordering." /> : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Product</th>
              <th className="text-right px-4 py-2">Sellable</th>
              <th className="text-right px-4 py-2">Reorder Point</th>
              <th className="text-right px-4 py-2">Suggested Qty</th>
              <th className="text-left px-4 py-2">Last Supplier</th>
              <th className="text-right px-4 py-2">Last Cost</th>
              <th className="text-left px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.variantId} className="border-t border-gray-100">
                <td className="px-4 py-2">{r.productName} {r.variantName ? `· ${r.variantName}` : ''}</td>
                <td className="px-4 py-2 text-right">{r.sellableStock}</td>
                <td className="px-4 py-2 text-right">{r.reorderPoint}</td>
                <td className="px-4 py-2 text-right">{r.suggestedQuantity ?? '—'}</td>
                <td className="px-4 py-2">{r.lastSupplierName || '—'}</td>
                <td className="px-4 py-2 text-right">{r.lastPurchaseCost != null ? formatCurrency(r.lastPurchaseCost) : '—'}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'OUT_OF_STOCK' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{r.status.replace(/_/g, ' ')}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function ExpiryTab() {
  const [mode, setMode] = useState('expiring');
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState(undefined);
  const load = useCallback(() => {
    apiJson(`/api/admin/retail-inventory-reports/expiry?mode=${mode}&days=${days}`).then((d) => setRows(d.rows || [])).catch(() => setRows([]));
  }, [mode, days]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select value={mode} onChange={(e) => setMode(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="expiring">Expiring soon</option>
          <option value="expired">Already expired</option>
        </select>
        {mode === 'expiring' && (
          <select value={days} onChange={(e) => setDays(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
            <option value={30}>Within 30 days</option>
            <option value={60}>Within 60 days</option>
            <option value={90}>Within 90 days</option>
          </select>
        )}
      </div>
      <Panel>
        {rows === undefined ? <Loading /> : rows.length === 0 ? <Empty text="Nothing to show." /> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">Product</th>
                <th className="text-left px-4 py-2">Batch</th>
                <th className="text-left px-4 py-2">Expiry</th>
                <th className="text-right px-4 py-2">Qty</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{r.product_name ? `${r.product_name}${r.variant_name ? ` · ${r.variant_name}` : ''}` : r.variant_name}</td>
                  <td className="px-4 py-2 text-gray-600">{r.batch_number}</td>
                  <td className="px-4 py-2 text-gray-600">{r.expiry_date}</td>
                  <td className="px-4 py-2 text-right">{r.quantity_on_hand}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function MovementAnalysisTab() {
  const [mode, setMode] = useState('slow');
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState(undefined);
  const load = useCallback(() => {
    apiJson(`/api/admin/retail-inventory-reports/movement-analysis?mode=${mode}&days=${days}`).then((d) => setRows(d.rows || [])).catch(() => setRows([]));
  }, [mode, days]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select value={mode} onChange={(e) => { setMode(e.target.value); setDays(e.target.value === 'dead' ? 90 : 30); }} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="slow">Slow-moving</option>
          <option value="dead">Dead stock</option>
        </select>
        <span className="text-xs text-gray-400">No sale in the last {days} days{mode === 'dead' ? ' (and received before then)' : ''}</span>
      </div>
      <Panel>
        {rows === undefined ? <Loading /> : rows.length === 0 ? <Empty text="Nothing matches this criteria." /> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">Variant</th>
                <th className="text-right px-4 py-2">Sellable</th>
                <th className="text-right px-4 py-2">Units Sold ({days}d)</th>
                <th className="text-left px-4 py-2">Last Sale</th>
                {mode === 'dead' && <th className="text-right px-4 py-2">Value</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.variantId} className="border-t border-gray-100">
                  <td className="px-4 py-2">{r.productName ? `${r.productName}${r.variantName ? ` · ${r.variantName}` : ''}` : `Variant #${r.variantId}`}</td>
                  <td className="px-4 py-2 text-right">{r.sellableStock}</td>
                  <td className="px-4 py-2 text-right">{r.unitsSoldInPeriod}</td>
                  <td className="px-4 py-2 text-gray-600">{r.lastSaleAt ? new Date(r.lastSaleAt).toLocaleDateString() : 'Never'}</td>
                  {mode === 'dead' && <td className="px-4 py-2 text-right">{formatCurrency(r.inventoryValue)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function ValuationTab() {
  const [data, setData] = useState(undefined);
  useEffect(() => { apiJson('/api/admin/retail-inventory-reports/valuation').then(setData).catch(() => setData({ rows: [], reconciliation: null })); }, []);
  if (data === undefined) return <Loading />;
  const { rows, reconciliation } = data;
  return (
    <div className="space-y-3">
      {reconciliation && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${reconciliation.reconciled ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
          Ledger total {formatCurrency(reconciliation.ledgerTotal)} vs GL (1210) {formatCurrency(reconciliation.glBalance)} —
          {reconciliation.reconciled ? ' reconciled.' : ` off by ${formatCurrency(reconciliation.difference)}.`}
        </div>
      )}
      <Panel>
        {!rows?.length ? <Empty text="No inventory on hand." /> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">Item</th>
                <th className="text-left px-4 py-2">Location</th>
                <th className="text-left px-4 py-2">Batch</th>
                <th className="text-right px-4 py-2">Qty</th>
                <th className="text-right px-4 py-2">Avg Cost</th>
                <th className="text-right px-4 py-2">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-4 py-2">{r.product_name ? `${r.product_name}${r.variant_name ? ` · ${r.variant_name}` : ''}` : r.variant_name}</td>
                  <td className="px-4 py-2 text-gray-600">{r.location_name}{!r.is_sellable ? ' (non-sellable)' : ''}</td>
                  <td className="px-4 py-2 text-gray-600">{r.batch_number || '—'}</td>
                  <td className="px-4 py-2 text-right">{r.quantity_on_hand}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(r.average_cost)}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function AgeingTab() {
  const [data, setData] = useState(undefined);
  useEffect(() => { apiJson('/api/admin/retail-inventory-reports/ageing').then(setData).catch(() => setData(null)); }, []);
  if (data === undefined) return <Loading />;
  if (!data) return <Empty text="Could not load ageing." />;
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{data.limitation}</p>
      <Panel>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Age</th>
              <th className="text-right px-4 py-2">Qty</th>
              <th className="text-right px-4 py-2">Value</th>
              <th className="text-right px-4 py-2">% of Value</th>
            </tr>
          </thead>
          <tbody>
            {data.buckets.map((b) => (
              <tr key={b.label} className="border-t border-gray-100">
                <td className="px-4 py-2">{b.label} days</td>
                <td className="px-4 py-2 text-right">{b.quantity}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(b.value)}</td>
                <td className="px-4 py-2 text-right">{b.percentOfValue}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {data.excludedNonBatchVariants?.length > 0 && (
        <p className="text-xs text-gray-400">Excluded (non-batch, no receipt layer): {data.excludedNonBatchVariants.map((v) => v.variant_name).join(', ')}</p>
      )}
    </div>
  );
}

function LedgerTab() {
  const [filters, setFilters] = useState({ movement_type: '', date_from: '', date_to: '' });
  const [rows, setRows] = useState(undefined);
  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.movement_type) params.set('movement_type', filters.movement_type);
    if (filters.date_from) params.set('date_from', filters.date_from);
    if (filters.date_to) params.set('date_to', filters.date_to);
    apiJson(`/api/admin/retail-inventory-reports/movements?${params.toString()}`).then((d) => setRows(d.movements || [])).catch(() => setRows([]));
  }, [filters]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select value={filters.movement_type} onChange={(e) => setFilters((f) => ({ ...f, movement_type: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="">All movement types</option>
          {['PURCHASE_RECEIPT', 'SALE', 'CUSTOMER_RETURN', 'TRANSFER_OUT', 'TRANSFER_IN', 'STOCK_ADJUSTMENT_IN', 'STOCK_ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY', 'TESTER', 'SAMPLE', 'INTERNAL_USE', 'SHRINKAGE'].map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <input type="date" value={filters.date_from} onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
        <input type="date" value={filters.date_to} onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
      </div>
      <Panel>
        {rows === undefined ? <Loading /> : rows.length === 0 ? <Empty text="No movements match." /> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">When</th>
                <th className="text-left px-4 py-2">Item</th>
                <th className="text-left px-4 py-2">Location</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-right px-4 py-2">Qty</th>
                <th className="text-right px-4 py-2">Value</th>
                <th className="text-left px-4 py-2">By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-600">{new Date(m.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2">{m.product_name ? `${m.product_name}${m.variant_name ? ` · ${m.variant_name}` : ''}` : m.variant_name}{m.batch_number ? ` (${m.batch_number})` : ''}</td>
                  <td className="px-4 py-2 text-gray-600">{m.location_name}</td>
                  <td className="px-4 py-2 text-gray-600">{m.movement_type.replace(/_/g, ' ')}</td>
                  <td className={`px-4 py-2 text-right font-medium ${Number(m.quantity) > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{m.quantity}</td>
                  <td className="px-4 py-2 text-right">{m.total_cost != null ? formatCurrency(m.total_cost) : '—'}</td>
                  <td className="px-4 py-2 text-gray-600">{m.created_by_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
