'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/admin/admin-layout';
import { ActionDrawer, ConfirmAction, DataTable, InlineAlert, Money, Quantity, StatusBadge, WorkspaceHeader } from '@/components/erp/primitives';
import { Button } from '@/components/ui/button';
import { apiJson } from '@/lib/authed-fetch';
import { useCapabilities } from '@/lib/use-capabilities';
import { useCommerceSearch } from '@/components/commerce/use-commerce-search';
import ProductVariantPicker from '@/components/commerce/product-variant-picker';

function OrderDetail({ id, onChanged }) {
  const [po, setPo] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const { can } = useCapabilities();
  useEffect(() => { apiJson(`/api/admin/retail-purchase-orders/${id}`).then((data) => setPo(data.purchase_order)).catch((cause) => setError(cause.error || 'Could not open purchase order.')); }, [id]);
  async function act(action, body = {}) {
    setBusy(true); setError('');
    try {
      const result = await apiJson(`/api/admin/retail-purchase-orders/${id}/${action}`, { method: 'POST', body: JSON.stringify(body) });
      setPo(result.purchase_order);
      onChanged();
    } catch (cause) { setError(cause.error || `Could not ${action} purchase order.`); }
    finally { setBusy(false); }
  }
  if (error && !po) return <InlineAlert tone="error">{error}</InlineAlert>;
  if (!po) return <p role="status">Loading purchase order…</p>;
  const total = po.lines.reduce((sum,line) => sum + Number(line.net_amount || 0), 0);
  return <div className="space-y-5 text-sm">
    {error && <InlineAlert tone="error">{error}</InlineAlert>}
    <div className="flex flex-wrap gap-4"><StatusBadge>{po.status.replaceAll('_',' ')}</StatusBadge><span>Expected {po.expected_date || 'not set'}</span><span>{po.lines.length} items</span>{can('retail_purchasing.view_cost') && <Money value={total} />}</div>
    <div className="space-y-2">{po.lines.map((line) => <div key={line.id} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b py-2"><span>{line.product_name} · {line.sku || line.variant_name}<small className="block text-slate-500">{line.tracking_mode} tracking</small></span><span className="text-right">Ordered <Quantity value={line.ordered_quantity} /><small className="block text-slate-500">Received <Quantity value={line.quantity_received} /></small></span>{can('retail_purchasing.view_cost') && <span className="text-right"><Money value={line.unit_cost} /><small className="block text-slate-500">per unit</small></span>}</div>)}</div>
    {po.rejection_reason && <InlineAlert tone="warning">Rejected: {po.rejection_reason}</InlineAlert>}
    <div className="flex flex-wrap gap-2">
      {po.status === 'DRAFT' && can('retail_purchasing.po.create') && <Button disabled={busy} onClick={() => act('submit')}>Submit for approval</Button>}
      {po.status === 'PENDING_APPROVAL' && can('retail_purchasing.po.approve') && <Button disabled={busy} onClick={() => act('approve')}>Approve</Button>}
      {['APPROVED','PARTIALLY_RECEIVED'].includes(po.status) && can('retail_purchasing.grn.receive') && <Link className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-semibold text-emerald-800" href={`/admin/retail-goods-receipts?po=${po.id}`}>Record delivery</Link>}
      {['DRAFT','PENDING_APPROVAL','APPROVED','REJECTED'].includes(po.status) && can('retail_purchasing.po.approve') && <ConfirmAction destructive confirmLabel="Cancel order"
        trigger={<Button variant="outline" disabled={busy} className="text-red-700">Cancel order</Button>}
        title={`Cancel ${po.po_number || 'this purchase order'}?`}
        description="The order stays on record as cancelled and can no longer be received. Once any stock has arrived, use a purchase return instead."
        onConfirm={() => act('cancel', { reason: 'Cancelled from purchase orders' })} />}
    </div>
    {po.status === 'PENDING_APPROVAL' && can('retail_purchasing.po.approve') && <div className="flex gap-2"><label className="flex-1">Rejection reason<input className="block w-full border border-slate-300 rounded px-2 py-1" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} /></label><Button variant="outline" disabled={busy || !rejectionReason.trim()} onClick={() => act('reject', { reason: rejectionReason })}>Reject</Button></div>}
    <p className="text-slate-500">Created {po.created_at} · Submitted {po.submitted_at || 'not yet'} · Approved {po.approved_at || 'not yet'}</p>
  </div>;
}

function CreateOrder({ onCreated }) {
  const [supplierQuery, setSupplierQuery] = useState('');
  const [supplier, setSupplier] = useState(null);
  const suppliers = useCommerceSearch(supplierQuery, { group: 'suppliers', limit: 8, enabled: supplierQuery.trim().length > 1 });
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function addLine(row) {
    setLines((previous) => previous.some((line) => line.variant_id === row.id) ? previous : [...previous, { variant_id: row.id, product_name: row.title, variant_name: row.variant_name, sku: row.sku, quantity: 1, unit_cost: '' }]);
  }
  async function save(event) {
    event.preventDefault();
    if (!supplier || !lines.length) { setError('Select a supplier and at least one SKU.'); return; }
    setBusy(true); setError('');
    try {
      const result = await apiJson('/api/admin/retail-purchase-orders', { method: 'POST', body: JSON.stringify({ supplierId: supplier.id, expected_date: expectedDate || null, notes,
        lines: lines.map((line) => ({ variantId: line.variant_id, orderedQuantity: Number(line.quantity), unitCost: Number(line.unit_cost) })) }) });
      onCreated(result.purchase_order.id);
    } catch (cause) { setError(cause.error || 'Could not create purchase order.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className="commerce-form space-y-5 pb-4">
    {error && <InlineAlert tone="error">{error}</InlineAlert>}
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5"><div><h3 className="font-semibold text-slate-900">1. Supplier and delivery</h3><p className="text-sm text-slate-500">Choose who you are buying from and when you expect the items.</p></div>
      {supplier ? <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3"><strong>{supplier.title}</strong><button type="button" className="text-sm font-semibold text-blue-700" onClick={() => setSupplier(null)}>Change supplier</button></div> : <label>Supplier<input value={supplierQuery} onChange={(event) => setSupplierQuery(event.target.value)} placeholder="Search supplier name" />{(suppliers.groups[0]?.results || []).length > 0 && <span className="overflow-hidden rounded-lg border border-slate-200 bg-white">{suppliers.groups[0].results.map((row) => <button type="button" key={row.id} className="block w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setSupplier(row); setSupplierQuery(''); }}>{row.title}</button>)}</span>}</label>}
      <div className="grid gap-3 sm:grid-cols-2"><label>Expected delivery<input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} /></label><label>Notes / reference<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional reference" /></label></div>
    </section>
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5"><div><h3 className="font-semibold text-slate-900">2. Products to purchase</h3><p className="text-sm text-slate-500">Select the exact variant. Each variant has its own quantity and cost.</p></div>
      <ProductVariantPicker onPick={addLine} selectedIds={lines.map((line) => line.variant_id)} />
      {!lines.length && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">Search above to add the first product.</p>}
      {lines.map((line) => <div key={line.variant_id} className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_auto] sm:items-end"><span className="min-w-0 font-medium text-slate-900">{line.product_name}<small className="block font-normal text-slate-500">{line.variant_name && line.variant_name !== 'Standard' ? `${line.variant_name} · ` : ''}{line.sku || `SKU #${line.variant_id}`}</small></span><label>Quantity<input required type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setLines((previous) => previous.map((item) => item.variant_id === line.variant_id ? { ...item, quantity: event.target.value } : item))} /></label><label>Unit cost<input required type="number" min="0" step="0.01" value={line.unit_cost} onChange={(event) => setLines((previous) => previous.map((item) => item.variant_id === line.variant_id ? { ...item, unit_cost: event.target.value } : item))} /></label><button type="button" className="self-end rounded-lg px-2 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" onClick={() => setLines((previous) => previous.filter((item) => item.variant_id !== line.variant_id))}>Remove</button></div>)}
    </section>
    {!!lines.length && <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 font-semibold"><span>Estimated total</span><Money value={lines.reduce((sum,line) => sum + Number(line.quantity) * Number(line.unit_cost || 0), 0)} /></div>}
    <div className="flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Save a draft, then submit it for approval. Stock changes when the delivery is recorded.</p><Button disabled={busy || !supplier || !lines.length} type="submit" className="shrink-0">{busy ? 'Saving…' : 'Save purchase order'}</Button></div>
  </form>;
}

export default function PurchaseOrdersPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState({ purchase_orders: [], loading: true });
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const { can } = useCapabilities();
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const id = Number(new URLSearchParams(window.location.search).get('po'));
      if (id > 0) setSelected(id);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setData((previous) => ({ ...previous, loading: true }));
      const params = new URLSearchParams({ q: query, status, page: String(page), page_size: '40' });
      apiJson(`/api/admin/retail-purchase-orders?${params}`, { signal: controller.signal })
        .then((result) => { if (!controller.signal.aborted) setData({ ...result, loading: false }); })
        .catch((cause) => { if (!controller.signal.aborted) setData({ purchase_orders: [], loading: false, error: cause.error || 'Could not load purchase orders.' }); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, status, page, revision]);
  return <AdminLayout><div className="commerce-page">
    <WorkspaceHeader title="Purchase orders" description="Plan what to buy, approve it, then record the delivery when it arrives." actions={can('retail_purchasing.po.create') && can('retail_purchasing.view_cost') && <Button onClick={() => setCreating(true)}>New purchase order</Button>} />
    <p className="mt-3 text-sm text-slate-600">Already bought items without an order? <Link href="/admin/retail-goods-receipts" className="font-semibold text-blue-700 underline">Record the purchase</Link> directly.</p>
    <div className="commerce-filters"><label>PO number or supplier<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label><label>Operational status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All</option>{['DRAFT','PENDING_APPROVAL','APPROVED','PARTIALLY_RECEIVED','RECEIVED','REJECTED','CANCELLED'].map((value) => <option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label></div>
    <DataTable rows={data.purchase_orders} loading={data.loading} error={data.error} onRowOpen={(row) => setSelected(row.id)} pageInfo={data.pagination && { page, pages: data.pagination.total_pages, total: data.pagination.total }} onPageChange={setPage} columns={[
      { key: 'po_number', label: 'PO', render: (row) => <button className="font-semibold text-blue-700" onClick={() => setSelected(row.id)}>{row.po_number}</button> },
      { key: 'supplier_name', label: 'Supplier' }, { key: 'order_date', label: 'Created' }, { key: 'expected_date', label: 'Expected' },
      { key: 'line_count', label: 'Items', numeric: true },
      { key: 'received_quantity', label: 'Receipt progress', numeric: true, render: (row) => <span><Quantity value={row.received_quantity} /> / <Quantity value={row.ordered_quantity} /></span> },
      { key: 'status', label: 'Operational status', render: (row) => <StatusBadge>{row.status.replaceAll('_',' ')}</StatusBadge> },
      ...(can('retail_purchasing.view_cost') ? [{ key: 'order_total', label: 'Total', numeric: true, render: (row) => <Money value={row.order_total} /> }] : []),
    ]} />
    <ActionDrawer open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }} title="Purchase order" description="Document lifecycle">{selected && <OrderDetail key={`${selected}-${revision}`} id={selected} onChanged={() => setRevision((value) => value + 1)} />}</ActionDrawer>
    <ActionDrawer extraWide open={creating} onOpenChange={setCreating} title="New purchase order" description="Choose a supplier and the exact product variants to buy."><CreateOrder onCreated={(id) => { setCreating(false); setSelected(id); setRevision((value) => value + 1); }} /></ActionDrawer>
  </div></AdminLayout>;
}
