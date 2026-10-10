'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/admin/admin-layout';
import { apiJson } from '@/lib/authed-fetch';
import { useCapabilities } from '@/lib/use-capabilities';

function SupplierPicker({ value, label, onChange }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || !query.trim()) return;
    let active = true;
    const timer = setTimeout(() => apiJson(`/api/admin/suppliers?search=${encodeURIComponent(query)}&page_size=8`)
      .then((data) => { if (active) setResults(data.suppliers || []); }).catch(() => { if (active) setResults([]); }), 180);
    return () => { active = false; clearTimeout(timer); };
  }, [query, open]);
  return <div className="relative min-w-44"><input aria-label="Search supplier" className="w-full rounded border border-slate-300 p-1.5" value={open ? query : label || ''} onFocus={() => { setOpen(true); setQuery(''); }} onChange={(e) => { setOpen(true); setQuery(e.target.value); }} placeholder={value ? label : 'Choose supplier'} />{open && query && <div className="absolute z-20 mt-1 max-h-52 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">{results.map((supplier) => <button type="button" key={supplier.id} className="block w-full p-2 text-left text-sm hover:bg-slate-50" onClick={() => { onChange(supplier); setOpen(false); }}>{supplier.name}</button>)}{!results.length && <p className="p-2 text-xs text-slate-500">No matching supplier</p>}</div>}</div>;
}

export default function ReplenishmentPage() {
  const { can } = useCapabilities();
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState({});
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState([]);
  // Dashboard "Reorder" links arrive as ?variant=12,15 — tick those rows once, on first load.
  const preselect = useRef(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson('/api/admin/retail-inventory-reports/reorder');
      const list = data.suggestions || [];
      setRows(list);
      if (preselect.current) {
        preselect.current = false;
        const ids = new Set((new URLSearchParams(window.location.search).get('variant') || '').split(',').filter(Boolean));
        if (ids.size) setSelected(Object.fromEntries(list.filter((row) => ids.has(String(row.variantId))).map((row) => [row.variantId, true])));
      }
    }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const edit = (row, patch) => setDrafts((current) => ({ ...current, [row.variantId]: { ...current[row.variantId], ...patch } }));
  const choice = (row) => ({ quantity: row.suggestedQuantity, supplierId: row.lastSupplierId,
    supplierName: row.lastSupplierName, unitCost: row.lastPurchaseCost, ...drafts[row.variantId] });
  const chosen = useMemo(() => rows.filter((row) => selected[row.variantId]), [rows, selected]);
  const groups = useMemo(() => {
    const grouped = new Map();
    for (const row of chosen) {
      const c = choice(row);
      const key = String(c.supplierId || 'unassigned');
      if (!grouped.has(key)) grouped.set(key, { supplierId: c.supplierId, supplierName: c.supplierName || 'No supplier assigned', lines: [] });
      grouped.get(key).lines.push({ row, ...c });
    }
    return [...grouped.values()];
  }, [chosen, drafts]); // eslint-disable-line react-hooks/exhaustive-deps
  const createDrafts = async () => {
    if (!groups.length) { setError('Select at least one product.'); return; }
    for (const group of groups) {
      if (!group.supplierId) { setError('Assign a supplier to every selected product.'); return; }
      for (const line of group.lines) {
        if (!(Number(line.quantity) > 0) || !(Number(line.unitCost) >= 0) || line.unitCost === null || line.unitCost === '') {
          setError(`Set a positive quantity and known unit cost for ${line.row.productName}.`); return;
        }
      }
    }
    setBusy(true); setError('');
    const results = [];
    try {
      for (const group of groups) {
        const result = await apiJson('/api/admin/retail-purchase-orders', { method: 'POST', body: JSON.stringify({
          supplier_id: group.supplierId,
          notes: 'Drafted from the replenishment worklist; review before submission.',
          lines: group.lines.map((line) => ({ variant_id: line.row.variantId, ordered_quantity: Number(line.quantity), unit_cost: Number(line.unitCost) })),
        }) });
        results.push(result.purchase_order);
      }
      setCreated(results); setSelected({}); await load();
    } catch (e) { setCreated(results); setError(`${results.length} draft order(s) created before this error: ${e.message}`); }
    finally { setBusy(false); }
  };
  return <AdminLayout><div className="px-6 pt-4"><Link className="inline-flex min-h-11 items-center text-sm underline" href="/admin/retail-operations">Forecast-assisted replenishment</Link></div><div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
    <header><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Inventory</p><h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Replenishment</h1><p className="text-sm text-slate-600">Suggestions use available stock, active reservations, approved incoming orders and each SKU’s reorder settings.</p></header>
    {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {created.length > 0 && <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm">Created {created.length} draft purchase order(s): {created.map((po) => <Link className="mr-2 font-medium text-blue-700 underline" key={po.id} href={`/admin/retail-purchase-orders?po=${po.id}`}>{po.po_number}</Link>)}</div>}
    <div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-600">{loading ? 'Loading…' : `${rows.length} SKU(s) need attention · ${chosen.length} selected`}</p><button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={load}>Refresh</button></div>
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[1070px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Select</th><th className="p-3">Product / reason</th><th className="p-3 text-right">Available</th><th className="p-3 text-right">Point</th><th className="p-3 text-right">Incoming</th><th className="p-3">Suggested qty</th><th className="p-3">Supplier</th>{can('retail_purchasing.view_cost') && <th className="p-3">Unit cost</th>}</tr></thead><tbody>{rows.map((row) => { const c = choice(row); return <tr key={row.variantId} className="border-t border-slate-100 align-top"><td className="p-3"><input type="checkbox" aria-label={`Select ${row.productName}`} checked={!!selected[row.variantId]} onChange={(e) => setSelected((current) => ({ ...current, [row.variantId]: e.target.checked }))} /></td><td className="p-3"><strong>{row.productName}</strong><span className="ml-1 text-slate-500">{row.variantName}</span><small className="block text-slate-500">{row.sku} · {row.reason}</small></td><td className="p-3 text-right tabular-nums">{row.available}</td><td className="p-3 text-right tabular-nums">{row.reorderPoint}</td><td className="p-3 text-right tabular-nums">{row.incomingQuantity}</td><td className="p-3"><input aria-label={`Suggested quantity for ${row.productName}`} type="number" min="1" step="1" value={c.quantity} className="w-20 rounded border border-slate-300 p-1.5" onChange={(e) => edit(row, { quantity: e.target.value })} /></td><td className="p-3"><SupplierPicker value={c.supplierId} label={c.supplierName} onChange={(supplier) => edit(row, { supplierId: supplier.id, supplierName: supplier.name })} /></td>{can('retail_purchasing.view_cost') && <td className="p-3"><input aria-label={`Unit cost for ${row.productName}`} type="number" min="0" step="0.01" value={c.unitCost ?? ''} className="w-24 rounded border border-slate-300 p-1.5" onChange={(e) => edit(row, { unitCost: e.target.value })} /></td>}</tr>; })}{!loading && !rows.length && <tr><td colSpan="8" className="p-10 text-center text-slate-500">No products currently need replenishment.</td></tr>}</tbody></table></div>
    {chosen.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">Draft orders to create</h2><div className="mt-2 flex flex-wrap gap-2">{groups.map((group) => <span key={group.supplierId || 'none'} className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{group.supplierName}: {group.lines.length} SKU(s)</span>)}</div><p className="mt-2 text-xs text-slate-500">These stay in Draft until a person submits and approves them. Missing suppliers and costs must be resolved here.</p>{can('retail_purchasing.po.create') && can('retail_purchasing.view_cost') && <button disabled={busy} className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" onClick={createDrafts}>{busy ? 'Creating…' : `Create ${groups.length} draft PO(s)`}</button>}</section>}
  </div></AdminLayout>;
}
