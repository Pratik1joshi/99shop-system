'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/admin/admin-layout';
import { Pencil, Plus } from 'lucide-react';
import { apiJson } from '@/lib/authed-fetch';
import { useCapabilities } from '@/lib/use-capabilities';
import SupplierFormModal from '@/components/purchases/supplier-form-modal';

const money = (value) => `Rs ${Number(value || 0).toFixed(2)}`;

export default function RetailSuppliersPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ total_pages: 1 });
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [error, setError] = useState('');
  const [pay, setPay] = useState(false);
  const [banks, setBanks] = useState([]);
  const [selectedInvoices, setSelectedInvoices] = useState({});
  const [payment, setPayment] = useState({ amount: '', method: 'cash', bank_account_id: '', note: '', reference: '' });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // {} = new supplier
  const { can } = useCapabilities();
  const canManage = can('suppliers.manage');
  const refresh = useCallback(async () => {
    const params = new URLSearchParams({ q: query, filter, page: String(page) });
    const data = await apiJson(`/api/admin/retail-suppliers?${params}`);
    setRows(data.suppliers || []); setPagination(data.pagination || { total_pages: 1 });
  }, [query, filter, page]);
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, [refresh]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const value = Number(new URLSearchParams(window.location.search).get('supplier'));
      if (value) setSelectedId(value);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const loadDetail = useCallback(async (id) => {
    const data = await apiJson(`/api/admin/retail-suppliers/${id}`);
    setDetail(data);
  }, []);
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    apiJson(`/api/admin/retail-suppliers/${selectedId}`).then((data) => { if (active) setDetail(data); })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [selectedId]);
  const openPay = async () => {
    try {
      const overview = await apiJson('/api/admin/accounts-payable');
      setBanks(overview.banks || []);
      setPayment({ amount: String(Math.max(0, Number(detail.summary.outstanding)).toFixed(2)), method: 'cash',
        bank_account_id: String(overview.banks?.[0]?.id || ''), note: '', reference: '' });
      setSelectedInvoices(Object.fromEntries((detail.invoices || []).map((invoice) => [invoice.journal_id, true])));
      setPay(true);
    } catch (e) { setError(e.message); }
  };
  const allocation = useMemo(() => {
    let remaining = Number(payment.amount || 0);
    return (detail?.invoices || []).filter((invoice) => selectedInvoices[invoice.journal_id]).map((inv) => {
      const applied = Math.min(Math.max(0, remaining), Number(inv.outstanding || 0));
      remaining -= applied;
      return { ...inv, applied };
    }).filter((inv) => inv.applied > 0);
  }, [detail, payment.amount, selectedInvoices]);
  const postPayment = async () => {
    const amount = Number(payment.amount);
    if (!(amount > 0) || amount > Number(detail.summary.outstanding) + 0.005) { setError('Payment must be greater than zero and no more than the outstanding balance.'); return; }
    const selectedOutstanding = detail.invoices.filter((invoice) => selectedInvoices[invoice.journal_id]).reduce((sum, invoice) => sum + Number(invoice.outstanding), 0);
    if (amount > selectedOutstanding + 0.005 || !allocation.length) { setError('Select invoices with enough outstanding value to cover the payment.'); return; }
    if (payment.method !== 'cash' && !payment.bank_account_id) { setError('Select a bank account.'); return; }
    setBusy(true); setError('');
    try {
      await apiJson('/api/admin/accounts-payable', { method: 'POST', body: JSON.stringify({ supplier_id: selectedId,
        amount, method: payment.method, bank_account_id: payment.method === 'cash' ? null : payment.bank_account_id,
        note: [payment.note, payment.reference && `Ref ${payment.reference}`].filter(Boolean).join(' · '),
        allocations: allocation.map((invoice) => ({ journal_id: invoice.journal_id, amount: Number(invoice.applied.toFixed(2)) })),
        external_ref: crypto.randomUUID() }) });
      setPay(false); await Promise.all([loadDetail(selectedId), refresh()]);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const tabs = ['Overview', 'Orders', 'Receipts', 'Invoices', 'Payments', 'Returns', 'Products'];
  return <AdminLayout><div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-pink-700">Purchasing</p><h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Suppliers</h1><p className="text-sm text-slate-600">Who you buy from, open orders and what you still owe.</p></div>{canManage && <button type="button" onClick={() => setEditing({})} className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"><Plus className="h-4 w-4" aria-hidden /> Add supplier</button>}</header>
    {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-2"><input aria-label="Search supplier name or contact" className="min-w-64 flex-1 rounded-lg border border-slate-300 p-2" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Name, phone or email" /><select aria-label="Supplier filter" className="rounded-lg border border-slate-300 p-2" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}><option value="all">Active</option><option value="outstanding">Outstanding</option><option value="orders">Open orders</option><option value="inactive">Inactive</option></select></div>
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Supplier</th><th className="p-3">Contact</th><th className="p-3 text-right">Open POs</th><th className="p-3 text-right">Outstanding</th><th className="p-3">Last receipt</th><th className="p-3 text-right">Recent spend</th><th className="p-3">Status</th></tr></thead><tbody>{rows.map((s) => <tr key={s.id} className="border-t border-slate-100"><td className="p-3"><button className="font-semibold text-blue-700 underline" onClick={() => { setSelectedId(s.id); setDetail(null); setTab('Overview'); }}>{s.name}</button></td><td className="p-3">{s.phone || s.email || '—'}</td><td className="p-3 text-right tabular-nums">{s.open_pos}</td><td className="p-3 text-right tabular-nums">{money(s.outstanding)}</td><td className="p-3">{s.last_receipt ? String(s.last_receipt).slice(0, 10) : '—'}</td><td className="p-3 text-right tabular-nums">{money(s.recent_spend)}</td><td className="p-3">{s.is_archived ? 'Inactive' : 'Active'}</td></tr>)}</tbody></table>{rows.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No suppliers here yet.{canManage && <> <button type="button" className="font-semibold text-pink-700 underline" onClick={() => setEditing({})}>Add your first supplier</button></>}</p>}</div>
    <div className="flex items-center gap-3 text-sm"><button disabled={page <= 1} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40" onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pagination.total_pages}</span><button disabled={page >= pagination.total_pages} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40" onClick={() => setPage(page + 1)}>Next</button></div>
    {selectedId && <div className="fixed inset-0 z-40 bg-slate-950/40" onMouseDown={() => { setSelectedId(null); setPay(false); }}><section role="dialog" aria-label="Supplier command center" className="absolute inset-y-0 right-0 w-full max-w-3xl overflow-y-auto bg-white p-4 shadow-2xl sm:p-6" onMouseDown={(e) => e.stopPropagation()}><div className="flex justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-slate-500">Supplier command center</p><h2 className="text-xl font-semibold">{detail?.supplier?.name || 'Loading…'}</h2><p className="text-sm text-slate-600">{detail?.supplier?.phone} {detail?.supplier?.email}</p></div><div className="flex shrink-0 gap-2">{canManage && detail?.supplier && <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold" onClick={() => setEditing(detail.supplier)}><Pencil className="h-3.5 w-3.5" aria-hidden />Edit</button>}<button className="h-9 rounded-xl border border-slate-300 px-3 text-sm font-semibold" aria-label="Close supplier" onClick={() => { setSelectedId(null); setPay(false); }}>Close</button></div></div>
      {detail && <><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[['Outstanding', money(detail.summary.outstanding)], ['Open POs', detail.summary.open_orders], ['Open invoices', detail.summary.open_invoices], ['Last receipt', detail.summary.last_receipt ? String(detail.summary.last_receipt).slice(0, 10) : '—']].map(([label,value]) => <div key={label} className="rounded-xl bg-slate-50 p-3"><small className="text-slate-500">{label}</small><strong className="block tabular-nums">{value}</strong></div>)}</div><p className="mt-2 text-xs text-slate-500">{detail.limitation}</p><div className="mt-4 flex flex-wrap gap-2">{tabs.map((name) => <button key={name} className={`rounded-lg px-3 py-1.5 text-sm ${tab === name ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`} onClick={() => setTab(name)}>{name}</button>)}</div>
      {tab === 'Overview' && <div className="mt-4 space-y-3 text-sm"><p>{detail.orders.length} purchase orders · {detail.receipts.length} receipts · {detail.returns.length} supplier returns</p><div className="flex flex-wrap gap-2"><Link className="rounded border border-slate-300 px-3 py-2" href={`/admin/retail-purchase-orders?supplier=${selectedId}`}>Purchase orders</Link><Link className="rounded border border-slate-300 px-3 py-2" href="/admin/retail-goods-receipts">Receive goods</Link>{Number(detail.summary.outstanding) > 0 && <button className="rounded bg-slate-950 px-3 py-2 text-white" onClick={openPay}>Pay supplier</button>}</div></div>}
      {tab === 'Orders' && <Records headers={['Order','Date','Status','Value']} rows={detail.orders.map((r) => [<Link key={r.id} className="text-blue-700 underline" href={`/admin/retail-purchase-orders?po=${r.id}`}>{r.po_number}</Link>,r.order_date,r.status,money(r.order_total)])} />}
      {tab === 'Receipts' && <Records headers={['Receipt','Invoice','Date','Value','Action']} rows={detail.receipts.map((r) => [r.grn_number,r.invoice_number || '—',r.receipt_date,money(r.total),r.status === 'POSTED' ? <Link key={r.id} className="text-blue-700 underline" href={`/admin/retail-purchase-returns?receipt=${r.id}`}>Return items</Link> : r.status])} />}
      {tab === 'Invoices' && <><p className="mt-3 text-xs text-slate-500">Payments recorded here are allocated to selected invoices. Older payments without allocations are applied to the oldest charges first. No due date is recorded.</p><Records headers={['Invoice / source','Date','Original','Outstanding']} rows={detail.invoices.map((r) => [r.invoice_number || r.description || r.source_type,r.date,money(r.total),money(r.outstanding)])} />{Number(detail.summary.outstanding) > 0 && <button className="mt-3 rounded bg-slate-950 px-3 py-2 text-sm text-white" onClick={openPay}>Record payment</button>}</>}
      {tab === 'Payments' && <Records headers={['Date','Reference','Paid','Journal']} rows={detail.statement.filter((r) => r.source_type === 'supplier_payment').map((r) => [r.entry_date,r.memo,money(r.debit),`#${r.journal_id}`])} />}
      {tab === 'Returns' && <Records headers={['Return','Receipt','Date','Status','Credit']} rows={detail.returns.map((r) => [r.return_number,r.goods_receipt_id,r.return_date,r.status,money(r.total)])} />}
      {tab === 'Products' && <Records headers={['Product','SKU','Received','Last price','Price history']} rows={detail.products.map((r) => [r.product_name,r.sku || '—',r.received_quantity,money(r.recent_prices[0]?.unit_cost),r.recent_prices.map((p) => `${String(p.posted_at).slice(0,10)}: ${money(p.unit_cost)}`).join(' · ')])} />}
      {pay && <div className="mt-5 space-y-3 rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm"><h3 className="font-semibold">Review supplier payment</h3><label className="block">Amount<input type="number" min="0.01" step="0.01" className="mt-1 w-full rounded border border-slate-300 p-2" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} /></label><label className="block">Method<select className="mt-1 w-full rounded border border-slate-300 p-2" value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option></select></label>{payment.method !== 'cash' && <label className="block">Funding account<select className="mt-1 w-full rounded border border-slate-300 p-2" value={payment.bank_account_id} onChange={(e) => setPayment({ ...payment, bank_account_id: e.target.value })}>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}<label className="block">Payment reference<input className="mt-1 w-full rounded border border-slate-300 p-2" value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} /></label><label className="block">Note<input className="mt-1 w-full rounded border border-slate-300 p-2" value={payment.note} onChange={(e) => setPayment({ ...payment, note: e.target.value })} /></label><div className="max-h-36 space-y-1 overflow-y-auto rounded border border-slate-200 bg-white p-2">{detail.invoices.map((invoice) => <label key={invoice.journal_id} className="flex items-center gap-2"><input type="checkbox" checked={!!selectedInvoices[invoice.journal_id]} onChange={(e) => setSelectedInvoices((current) => ({ ...current, [invoice.journal_id]: e.target.checked }))} /><span>{invoice.invoice_number || invoice.description || `Journal #${invoice.journal_id}`} · {money(invoice.outstanding)} open</span></label>)}</div><p>Selected outstanding: {money(detail.invoices.filter((invoice) => selectedInvoices[invoice.journal_id]).reduce((sum, invoice) => sum + Number(invoice.outstanding), 0))} · Allocated: {money(allocation.reduce((sum, inv) => sum + inv.applied, 0))} · Unallocated: {money(Math.max(0, Number(payment.amount || 0) - allocation.reduce((sum, inv) => sum + inv.applied, 0)))} · Remaining payable: {money(Math.max(0, Number(detail.summary.outstanding) - Number(payment.amount || 0)))}</p><div>{allocation.map((inv,i) => <p key={i}>{inv.invoice_number || inv.description}: {money(inv.applied)}</p>)}</div><div className="flex gap-2"><button className="rounded border border-slate-300 bg-white px-3 py-2" onClick={() => setPay(false)}>Cancel</button><button disabled={busy} className="rounded bg-slate-950 px-3 py-2 text-white disabled:opacity-50" onClick={postPayment}>{busy ? 'Posting…' : 'Post payment'}</button></div></div>}
      </>}
    </section></div>}
    {canManage && editing && <SupplierFormModal supplier={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { refresh().catch((e) => setError(e.message)); if (editing.id && selectedId) loadDetail(selectedId).catch(() => {}); }} />}
  </div></AdminLayout>;
}

function Records({ headers, rows }) { return <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[550px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{headers.map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{rows.map((row,index) => <tr key={index} className="border-t border-slate-100">{row.map((cell,i) => <td key={i} className="p-2">{cell}</td>)}</tr>)}</tbody></table>{rows.length === 0 && <p className="p-5 text-center text-sm text-slate-500">No records yet.</p>}</div>; }
