'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRightLeft, ClipboardList, FileClock, PackageCheck, Pencil, Plus, Minus, ShoppingCart, ScrollText, Eye } from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import { ActionDrawer, DataTable, InlineAlert, Money, Quantity, StatusBadge, WorkspaceHeader } from '@/components/erp/primitives';
import { apiJson } from '@/lib/authed-fetch';
import { useCapabilities } from '@/lib/use-capabilities';
import { Button } from '@/components/ui/button';

const adjustmentReasons = ['OPENING_STOCK', 'FOUND_STOCK', 'COUNT_VARIANCE', 'DAMAGE', 'EXPIRY', 'SHRINKAGE', 'THEFT', 'DATA_CORRECTION', 'OTHER'];
const reasonLabel = (reason) => reason.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
const adjustmentKey = () => crypto.randomUUID();

const quantity = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
const stateLabels = { LOW: 'Low stock', OUT: 'Out of stock', EXPIRING: 'Expiring in 30 days', QUARANTINED: 'Quarantined', IN_TRANSIT: 'In transit', INCOMING: 'Incoming' };

function StockConditions({ row }) {
  const labels = [];
  if (row.location_code === 'QUARANTINE' && Number(row.on_hand) > 0) labels.push('Quarantined');
  if (row.location_code === 'IN_TRANSIT' && Number(row.on_hand) > 0) labels.push('In transit');
  if (Number(row.expired) > 0) labels.push('Expired');
  if (Number(row.expiring) > 0) labels.push('Expiring');
  if (row.location_code !== 'QUARANTINE' && row.location_code !== 'IN_TRANSIT') {
    if (Number(row.available) <= 0) labels.push('Out of stock');
    else if (Number(row.reorder_point) > 0 && Number(row.available) <= Number(row.reorder_point)) labels.push('Low');
    else labels.push('Healthy');
  }
  if (Number(row.incoming) > 0) labels.push('Incoming');
  return <span className="flex flex-wrap gap-1">{labels.map((label) => <StatusBadge key={label} tone={['Out of stock','Expired'].includes(label) ? 'danger' : ['Low','Expiring'].includes(label) ? 'warning' : 'neutral'}>{label}</StatusBadge>)}</span>;
}

function StockDetail({ row, onPosted }) {
  const { can } = useCapabilities();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjustment, setAdjustment] = useState({ quantity: '', reason: '', batchId: '', serials: '', notes: '' });
  const [direction, setDirection] = useState('remove');
  const [adjustmentError, setAdjustmentError] = useState('');
  const [posting, setPosting] = useState(false);
  const adjustmentKeyRef = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    apiJson(`/api/admin/retail-inventory/workspace/${row.variant_id}?location_id=${row.location_id}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setDetail(data); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause.error || 'Could not load stock detail.'); });
    return () => controller.abort();
  }, [row.variant_id, row.location_id]);
  const postAdjustment = async (event) => {
    event.preventDefault();
    const enteredQuantity = Number(adjustment.quantity);
    const quantityValue = direction === 'add' ? enteredQuantity : -enteredQuantity;
    const serialNumbers = adjustment.serials.split(/[\s,]+/).filter(Boolean);
    if (!Number.isFinite(enteredQuantity) || enteredQuantity <= 0 || !adjustment.reason) return setAdjustmentError('Enter a quantity greater than zero and choose a reason.');
    if (row.tracking_mode === 'batch' && !adjustment.batchId) return setAdjustmentError('Choose the affected batch.');
    if (row.tracking_mode === 'serial' && (!Number.isInteger(quantityValue) || serialNumbers.length !== Math.abs(quantityValue) || new Set(serialNumbers).size !== serialNumbers.length)) return setAdjustmentError('Enter one distinct serial number per unit.');
    if (quantityValue < 0 && Math.abs(quantityValue) > Number(row.tracking_mode === 'batch' ? detail?.batches?.find((batch) => String(batch.id) === String(adjustment.batchId))?.quantity_on_hand ?? 0 : detail?.identity?.on_hand ?? row.on_hand)) return setAdjustmentError('The removal exceeds the stock on hand at this location or batch.');
    setPosting(true); setAdjustmentError('');
    try {
      await apiJson('/api/admin/retail-inventory-adjustments', { method: 'POST', body: JSON.stringify({
        type: 'MANUAL', variant_id: row.variant_id, location_id: row.location_id,
        batch_id: adjustment.batchId || null, serial_numbers: row.tracking_mode === 'serial' ? serialNumbers : undefined,
        quantity: quantityValue, reason: adjustment.reason, notes: adjustment.notes,
        idempotency_key: adjustmentKeyRef.current ||= adjustmentKey(),
      }) });
      adjustmentKeyRef.current = null;
      setAdjusting(false); setAdjustment({ quantity: '', reason: '', batchId: '', serials: '', notes: '' });
      onPosted();
    } catch (cause) { setAdjustmentError(cause.error || 'Could not post adjustment. Stock was not changed.'); }
    finally { setPosting(false); }
  };
  const updateAdjustment = (field, value) => { adjustmentKeyRef.current = null; setAdjustment((current) => ({ ...current, [field]: value })); setAdjustmentError(''); };
  return <div className="space-y-6 text-sm">
    <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-4">
      {[['On hand', row.on_hand], ['Reserved', row.reserved], ['Available', row.available], ['Incoming', row.incoming], ['Reorder point', row.reorder_point], ['Reorder quantity', row.reorder_quantity]].map(([label,value]) => <div key={label}><small className="block text-slate-500">{label}</small><strong>{quantity(value)}</strong></div>)}
      {can('retail_inventory.view_cost') && row.current_cost != null && <><div><small className="block text-slate-500">Current cost</small><Money value={row.current_cost} /></div><div><small className="block text-slate-500">Inventory value</small><Money value={row.inventory_value} /></div></>}
    </div>
    <div><StockConditions row={row} /><p className="mt-2 text-slate-600">{row.location_name} · {row.tracking_mode === 'none' ? 'Quantity' : row.tracking_mode} tracking</p></div>
    <div className="flex flex-wrap gap-2">
      {can('retail_purchasing.grn.receive') && <Link className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-semibold text-slate-800 hover:bg-slate-50" href="/admin/retail-goods-receipts"><PackageCheck className="h-4 w-4 text-emerald-700" aria-hidden />Purchases</Link>}
      {can('retail_purchasing.po.create') && <Link className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-semibold text-slate-800 hover:bg-slate-50" href="/admin/retail-purchase-orders"><ShoppingCart className="h-4 w-4 text-blue-700" aria-hidden />Purchase orders</Link>}
      {can('retail_inventory.adjust') && row.location_code !== 'IN_TRANSIT' && <button type="button" onClick={() => setAdjusting((value) => !value)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-semibold text-slate-800 hover:bg-slate-50"><Pencil className="h-4 w-4 text-slate-600" aria-hidden />Adjust stock</button>}
      <Link className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-semibold text-slate-800 hover:bg-slate-50" href={`/admin/products?product=${row.product_id}`}><Eye className="h-4 w-4 text-slate-600" aria-hidden />View product</Link>
      {can('retail_inventory.count.create') && <Link className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-semibold text-slate-800 hover:bg-slate-50" href="/admin/retail-stock-counts"><ClipboardList className="h-4 w-4 text-slate-600" aria-hidden />Count</Link>}
      {can('retail_inventory.transfer.create') && <Link className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-semibold text-slate-800 hover:bg-slate-50" href="/admin/retail-transfers"><ArrowRightLeft className="h-4 w-4 text-slate-600" aria-hidden />Transfer</Link>}
      <Link className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-semibold text-slate-800 hover:bg-slate-50" href={`/admin/retail-inventory-movements?q=${encodeURIComponent(row.sku || row.product_name)}`}><FileClock className="h-4 w-4 text-slate-600" aria-hidden />Records</Link>
    </div>
    {adjusting && <form onSubmit={postAdjustment} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-semibold text-slate-900">Adjust {row.product_name} at {row.location_name}</h3>
      <div className="flex items-end gap-2"><fieldset><legend className="mb-1 font-medium">Change</legend><div className="flex gap-1">{[['add', Plus, 'Add stock'], ['remove', Minus, 'Remove stock']].map(([value, Icon, label]) => <button key={value} type="button" aria-label={label} title={label} aria-pressed={direction === value} onClick={() => { setDirection(value); adjustmentKeyRef.current = null; setAdjustmentError(''); }} className={`flex h-11 w-11 items-center justify-center rounded-lg border ${direction === value ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}><Icon className="h-5 w-5" aria-hidden /></button>)}</div></fieldset><label className="min-w-0 flex-1 font-medium">Quantity<input className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5" type="number" min={row.tracking_mode === 'serial' ? '1' : '0.001'} step={row.tracking_mode === 'serial' ? '1' : '0.001'} value={adjustment.quantity} onChange={(event) => updateAdjustment('quantity', event.target.value)} required /></label></div>
      <label className="block">Reason<select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" value={adjustment.reason} onChange={(event) => updateAdjustment('reason', event.target.value)} required><option value="">Choose a reason</option>{adjustmentReasons.map((reason) => <option key={reason} value={reason}>{reasonLabel(reason)}</option>)}</select></label>
      {row.tracking_mode === 'batch' && <label className="block">Batch<select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" value={adjustment.batchId} onChange={(event) => updateAdjustment('batchId', event.target.value)} required><option value="">Choose a batch</option>{(detail?.batches || []).map((batch) => <option key={batch.id} value={batch.id}>{batch.batch_number} · {quantity(batch.quantity_on_hand)} on hand</option>)}</select></label>}
      {row.tracking_mode === 'serial' && <label className="block">Serial numbers, separated by spaces<textarea className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" rows={2} value={adjustment.serials} onChange={(event) => updateAdjustment('serials', event.target.value)} required />{direction === 'remove' && <small>At this location: {(detail?.serials || []).filter((serial) => serial.status === 'IN_STOCK').map((serial) => serial.serial_number).join(', ') || 'none'}</small>}</label>}
      <label className="block">Note (optional)<input className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" value={adjustment.notes} onChange={(event) => updateAdjustment('notes', event.target.value)} /></label>
      {adjustmentError && <InlineAlert tone="error">{adjustmentError}</InlineAlert>}
      <div className="flex gap-2"><Button type="submit" disabled={posting || !detail}>{posting ? 'Saving…' : 'Save adjustment'}</Button><Button type="button" variant="outline" onClick={() => setAdjusting(false)}>Cancel</Button></div>
    </form>}
    {error && <InlineAlert tone="error">{error}</InlineAlert>}
    {!detail && !error && <p role="status">Loading history…</p>}
    {detail && <>
      <section className="rounded-2xl border border-slate-200 p-4"><h3 className="mb-2 font-semibold">Incoming purchase orders</h3>{detail.purchase_orders.length ? <div className="divide-y divide-slate-100">{detail.purchase_orders.map((po) => <p key={po.id} className="flex flex-wrap justify-between gap-2 py-2"><Link href={`/admin/retail-purchase-orders?po=${po.id}`} className="font-medium text-blue-700">{po.po_number} · {po.supplier_name}</Link><span>{quantity(Number(po.ordered_quantity) - Number(po.quantity_received))} remaining</span></p>)}</div> : <p className="text-slate-500">No approved incoming order.</p>}</section>
      {row.tracking_mode === 'batch' && <section className="rounded-2xl border border-slate-200 p-4"><h3 className="mb-2 font-semibold">Batches</h3>{detail.batches.length ? detail.batches.map((batch) => <p key={batch.id} className="border-t border-slate-100 py-2"><strong>{batch.batch_number}</strong> · {quantity(batch.quantity_on_hand)} on hand · Expires {batch.expiry_date || 'not recorded'} · {batch.status}</p>) : <p className="text-slate-500">No batches at this location.</p>}</section>}
      {row.tracking_mode === 'serial' && <section className="rounded-2xl border border-slate-200 p-4"><h3 className="mb-2 font-semibold">Serial numbers</h3>{detail.serials.length ? detail.serials.map((serial) => <p key={serial.id} className="border-t border-slate-100 py-2"><strong>{serial.serial_number}</strong> · {serial.status}</p>) : <p className="text-slate-500">No serial numbers at this location.</p>}</section>}
      <section className="rounded-2xl border border-slate-200 p-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Recent stock records</h3><Link href={`/admin/retail-inventory-movements?q=${encodeURIComponent(row.sku || row.product_name)}`} className="text-blue-700">View all</Link></div>{detail.movements.length ? <div className="divide-y divide-slate-100">{detail.movements.map((movement) => <div key={movement.id} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto]"><div><strong className="font-medium">{movement.movement_type.replaceAll('_',' ')}</strong><p className="text-xs text-slate-500">{String(movement.created_at).slice(0, 16)} · {movement.reference_type || 'Manual'} #{movement.reference_id || '—'}{movement.reason && ` · ${movement.reason}`}</p></div><strong className="tabular-nums">Qty {quantity(movement.quantity)}</strong></div>)}</div> : <p className="text-slate-500">No movement recorded.</p>}</section>
      <div className="grid gap-3 sm:grid-cols-2"><section className="rounded-2xl border border-slate-200 p-4"><h3 className="mb-2 font-semibold">Physical counts</h3>{detail.counts.map((count) => <p key={count.id} className="border-t border-slate-100 py-2">{count.count_number} · {count.status} · Variance {quantity(count.variance)}</p>)}{!detail.counts.length && <p className="text-slate-500">No counts yet.</p>}</section><section className="rounded-2xl border border-slate-200 p-4"><h3 className="mb-2 font-semibold">Transfers</h3>{detail.transfers.map((transfer) => <p key={transfer.id} className="border-t border-slate-100 py-2">{transfer.transfer_number} · {transfer.source_name} → {transfer.destination_name} · {transfer.status}</p>)}{!detail.transfers.length && <p className="text-slate-500">No transfers yet.</p>}</section></div>
    </>}
  </div>;
}

function ProductStockDetail({ product, locations, initialLocation, onPosted }) {
  const [locationId, setLocationId] = useState(initialLocation || String(locations.find((item) => item.is_default)?.id || locations[0]?.id || ''));
  const selectedLocation = locationId || String(locations.find((item) => item.is_default)?.id || locations[0]?.id || '');
  const [rows, setRows] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!selectedLocation) return;
    const controller = new AbortController();
    apiJson(`/api/admin/retail-inventory/workspace?${new URLSearchParams({ product_id: String(product.product_id), location_id: String(selectedLocation), page_size: '250' })}`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setRows(result.rows || []); setError(''); } })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause.error || 'Could not load variants.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [product.product_id, selectedLocation, version]);
  const active = rows.find((row) => row.variant_id === activeId);
  return <div className="space-y-4 text-sm">
    <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-4"><div><small className="block text-slate-500">Variants</small><strong>{product.variant_count}</strong></div><div><small className="block text-slate-500">On hand here</small><strong>{quantity(rows.reduce((sum, row) => sum + Number(row.on_hand), 0))}</strong></div><div><small className="block text-slate-500">Available here</small><strong>{quantity(rows.reduce((sum, row) => sum + Number(row.available), 0))}</strong></div></div>
    <label className="block font-medium">Location<select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5" value={selectedLocation} onChange={(event) => { setLocationId(event.target.value); setActiveId(null); setRows([]); setLoading(true); }}>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <div><h3 className="font-semibold text-slate-900">Choose a variant to view or change stock</h3><p className="text-slate-500">Each variant has its own quantity, tracking and stock records.</p></div>
    {loading && <p role="status" className="text-slate-500">Loading variants…</p>}
    {error && <InlineAlert tone="error">{error}</InlineAlert>}
    {!loading && !error && <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">{rows.map((row) => <button key={row.variant_id} type="button" aria-pressed={activeId === row.variant_id} onClick={() => setActiveId(row.variant_id)} className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-blue-50 ${activeId === row.variant_id ? 'bg-blue-50 text-blue-900' : ''}`}><span className="min-w-0"><strong className="block truncate">{row.variant_name || 'Standard'}</strong><small className="text-slate-500">{row.sku || `Variant #${row.variant_id}`}</small></span><span className="shrink-0 text-right tabular-nums"><strong className="block">{quantity(row.available)} available</strong><small className="text-slate-500">{quantity(row.on_hand)} on hand</small></span></button>)}</div>}
    {active && <div className="border-t border-slate-200 pt-4"><h3 className="mb-3 text-base font-bold">{active.variant_name || 'Standard'} · {active.location_name}</h3><StockDetail key={`${active.variant_id}-${active.location_id}-${version}`} row={active} onPosted={() => { setVersion((value) => value + 1); onPosted(); }} /></div>}
  </div>;
}

export default function RetailInventoryPage() {
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const [location, setLocation] = useState('');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], loading: true });
  const [locations, setLocations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [version, setVersion] = useState(0);
  const { can } = useCapabilities();
  useEffect(() => { const frame = requestAnimationFrame(() => { const initialQuery = new URLSearchParams(window.location.search).get('q'); if (initialQuery) setQuery(initialQuery); }); return () => cancelAnimationFrame(frame); }, []);
  useEffect(() => { apiJson('/api/admin/retail-inventory/locations').then((result) => setLocations(result.locations || [])).catch(() => {}); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setData((previous) => ({ ...previous, loading: true }));
      const params = new URLSearchParams({ q: query, state, location_id: location, sort, page: String(page), page_size: '40', view: 'products' });
      apiJson(`/api/admin/retail-inventory/workspace?${params}`, { signal: controller.signal })
        .then((result) => { if (!controller.signal.aborted) setData({ ...result, loading: false }); })
        .catch((error) => { if (!controller.signal.aborted) setData({ rows: [], loading: false, error: error.error || 'Could not load stock.' }); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, state, location, sort, page, version]);
  const change = (setter) => (value) => { setter(value); setPage(1); };
  const counts = data.summary || {};
  return <AdminLayout><div className="commerce-page">
    <WorkspaceHeader title="Inventory" description="See what is on hand, receive purchases and track every stock change." actions={<Link className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800" href="/admin/retail-inventory-movements">View stock records</Link>} />
    <nav className="mt-4 flex flex-wrap gap-2" aria-label="Inventory tasks">
      {can('retail_purchasing.grn.receive') && <Link href="/admin/retail-goods-receipts" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 hover:border-emerald-300 hover:bg-emerald-50"><PackageCheck className="h-4 w-4 text-emerald-700" aria-hidden />Purchases</Link>}
      {can('retail_purchasing.po.create') && <Link href="/admin/retail-purchase-orders" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 hover:border-blue-300 hover:bg-blue-50"><ShoppingCart className="h-4 w-4 text-blue-700" aria-hidden />Purchase orders</Link>}
      {can('retail_inventory.count.create') && <Link href="/admin/retail-stock-counts" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"><ClipboardList className="h-4 w-4 text-slate-600" aria-hidden />Stock counts</Link>}
      <Link href="/admin/retail-inventory-movements" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"><ScrollText className="h-4 w-4 text-slate-600" aria-hidden />Stock records</Link>
    </nav>
    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-slate-700">Have a product list in a file? <Link className="font-semibold text-blue-700 underline" href="/admin/products?import=1">Import products from CSV</Link>. To enter quantities bought from a supplier, use <Link className="font-semibold text-blue-700 underline" href="/admin/retail-goods-receipts">Purchases</Link> and record the delivery cost.</div>
    <div className="mt-6 flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-lg font-bold text-slate-900">Stock by product</h2><p className="text-sm text-slate-600">Open a product, choose its variant and location, then view or change its stock.</p></div><Link className="text-sm font-semibold text-blue-700 underline" href="/admin/products">Add or edit products</Link></div>
    <div className="flex flex-wrap gap-x-4 gap-y-2 border-y border-slate-200 py-3 text-sm" aria-label="Stock attention">
      {[['LOW','low_count'],['OUT','out_count'],['EXPIRING','expiring_count'],['QUARANTINED','quarantined_count'],['IN_TRANSIT','transit_count'],['INCOMING','incoming_count']].map(([key,count]) => <button key={key} type="button" onClick={() => change(setState)(state === key ? '' : key)} className={`text-left hover:underline ${state === key ? 'font-bold text-blue-800' : 'text-slate-600'}`}>{stateLabels[key]} <strong className="tabular-nums">{Number(counts[count] || 0)}</strong></button>)}
    </div>
    <div className="commerce-filters">
      <label>Search product, SKU, barcode, serial or batch<input value={query} onChange={(event) => change(setQuery)(event.target.value)} /></label>
      <label>Stock state<select value={state} onChange={(event) => change(setState)(event.target.value)}><option value="">All states</option>{Object.entries(stateLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Location<select value={location} onChange={(event) => change(setLocation)(event.target.value)}><option value="">All locations</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Sort<select value={sort} onChange={(event) => change(setSort)(event.target.value)}><option value="name">Product</option><option value="available">Available, low first</option><option value="incoming">Incoming, high first</option></select></label>
    </div>
    <DataTable rows={data.rows?.map((row) => ({ ...row, id: row.product_id })) || []} loading={data.loading} error={data.error} onRowOpen={setSelected} pageInfo={data.pagination && { page, pages: data.pagination.total_pages, total: data.pagination.total }} onPageChange={setPage} columns={[
      { key: 'product_name', label: 'Product', render: (row) => <button className="text-left font-medium text-blue-800" onClick={() => setSelected(row)}>{row.product_name}<small className="block font-normal text-slate-500">{row.variant_count} variant{row.variant_count === 1 ? '' : 's'}</small></button> },
      { key: 'on_hand', label: 'On hand', numeric: true, render: (row) => <Quantity value={row.on_hand} /> },
      { key: 'reserved', label: 'Reserved', numeric: true, render: (row) => <Quantity value={row.reserved} /> },
      { key: 'available', label: 'Available', numeric: true, render: (row) => <Quantity value={row.available} /> },
      { key: 'incoming', label: 'Incoming', numeric: true, render: (row) => <Quantity value={row.incoming} /> },
      { key: 'state', label: 'Stock state', render: (row) => <span className="flex flex-wrap gap-1">{row.out_count > 0 && <StatusBadge tone="danger">{row.out_count} out</StatusBadge>}{row.low_count > 0 && <StatusBadge tone="warning">{row.low_count} low</StatusBadge>}{row.expiring_count > 0 && <StatusBadge tone="warning">Expiring</StatusBadge>}{row.quarantined_count > 0 && <StatusBadge tone="neutral">Quarantined</StatusBadge>}{row.transit_count > 0 && <StatusBadge tone="neutral">In transit</StatusBadge>}{row.incoming > 0 && <StatusBadge tone="neutral">Incoming</StatusBadge>}{row.out_count <= 0 && row.low_count <= 0 && row.expiring_count <= 0 && row.quarantined_count <= 0 && row.transit_count <= 0 && row.incoming <= 0 && <StatusBadge tone="neutral">In stock</StatusBadge>}</span> },
      ...(can('retail_inventory.view_cost') ? [{ key: 'inventory_value', label: 'Value', numeric: true, render: (row) => <Money value={row.inventory_value} /> }] : []),
      { key: 'actions', label: 'Action', render: (row) => <button type="button" className="font-semibold text-blue-700 underline" onClick={() => setSelected(row)}>View details</button> },
    ]} />
    <ActionDrawer extraWide open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }} title={selected?.product_name || 'Stock detail'} description={selected ? `${selected.variant_count} variant${selected.variant_count === 1 ? '' : 's'} · choose one to view or adjust` : ''}>{selected && <ProductStockDetail key={selected.product_id} product={selected} locations={locations} initialLocation={location} onPosted={() => setVersion((value) => value + 1)} />}</ActionDrawer>
  </div></AdminLayout>;
}
