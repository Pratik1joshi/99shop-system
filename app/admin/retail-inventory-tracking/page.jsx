'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/admin/admin-layout';
import { ActionDrawer, DataTable, InlineAlert, Money, Quantity, StatusBadge, WorkspaceHeader } from '@/components/erp/primitives';
import { apiJson } from '@/lib/authed-fetch';
import { useCapabilities } from '@/lib/use-capabilities';

function TrackingDetail({ row, mode }) {
  const [serial, setSerial] = useState(null);
  const [error, setError] = useState('');
  const { can } = useCapabilities();
  useEffect(() => {
    if (mode !== 'serial') return;
    const controller = new AbortController();
    apiJson(`/api/admin/retail-serials/${encodeURIComponent(row.serial_number)}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setSerial(data.serial); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause.error || 'Could not load serial.'); });
    return () => controller.abort();
  }, [row.serial_number, mode]);
  if (mode === 'batch') return <div className="space-y-4 text-sm"><div className="grid grid-cols-2 gap-3"><p>Product<br /><strong>{row.product_name} · {row.sku || row.variant_name}</strong></p><p>Location<br /><strong>{row.location_name}</strong></p><p>Batch<br /><strong>{row.batch_number}</strong></p><p>On hand<br /><strong>{row.quantity_on_hand}</strong></p><p>Received<br /><strong>{row.received_at || 'Unknown'}</strong></p><p>Expiry<br /><strong>{row.expiry_date || 'Not recorded'}</strong></p><p>Supplier<br /><strong>{row.supplier_name || 'Not recorded'}</strong></p><p>State<br /><strong>{row.location_code === 'QUARANTINE' ? 'Quarantined' : row.status}</strong></p></div>{can('retail_inventory.view_cost') && row.unit_cost != null && <p>Receipt cost <Money value={row.unit_cost} /> · Value <Money value={row.inventory_value} /></p>}<div className="flex gap-3 text-blue-700"><Link href={`/admin/retail-inventory?product=${row.product_id}`}>View stock</Link><Link href="/admin/retail-inventory-ops">Adjustment / quarantine</Link></div></div>;
  return <div className="space-y-4 text-sm">{error && <InlineAlert tone="error">{error}</InlineAlert>}{!serial && !error && <p role="status">Loading serial…</p>}{serial && <><div className="grid grid-cols-2 gap-3"><p>Serial<br /><strong>{serial.serial_number}</strong></p><p>Status<br /><strong>{serial.status}</strong></p><p>Product<br /><strong>{serial.product_name} · {row.sku || serial.variant_name}</strong></p><p>Location<br /><strong>{row.location_name || 'Not at a location'}</strong></p><p>Supplier<br /><strong>{row.supplier_name || 'Not recorded'}</strong></p><p>Received<br /><strong>{serial.received_at || 'Not recorded'}</strong></p><p>Warranty end<br /><strong>{serial.warranty_end_date || 'Not recorded'}</strong></p>{serial.customer_name && <p>Customer<br /><strong>{serial.customer_name}</strong></p>}</div>{can('retail_inventory.view_cost') && serial.unit_cost != null && <p>Purchase cost <Money value={serial.unit_cost} /></p>}{serial.sale_number && <Link className="text-blue-700" href={`/admin/retail-sales-history?sale=${serial.retail_sale_id}`}>View sale {serial.sale_number}</Link>}<section>{serial.after_sales?.map(c=><p key={c.id}><Link className="text-blue-700 underline" href={"/admin/retail-after-sales?claim="+c.id}>{c.claim_number} ? {c.status} ? {c.resolution||"Open"}</Link>{c.replacement_serial&&<span> ? {c.replacement_serial}</span>}{c.rma_number&&<span> ? {c.rma_number} {c.supplier_status}</span>}</p>)}</section>{can("warranty.view")&&<Link className="inline-flex min-h-11 items-center text-blue-700" href={"/admin/retail-after-sales?purchase="+encodeURIComponent(serial.serial_number)}>Warranty / service lookup</Link>}<p className="text-slate-600">Actions depend on this serial’s canonical state. Use the linked sale, return, transfer or supplier document to change it.</p></>}</div>;
}

export default function TrackingPage() {
  const [mode, setMode] = useState('batch');
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const [location, setLocation] = useState('');
  const [page, setPage] = useState(1);
  const [locations, setLocations] = useState([]);
  const [data, setData] = useState({ rows: [], loading: true });
  const [selected, setSelected] = useState(null);
  const { can } = useCapabilities();
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('serial')) { setMode('serial'); setQuery(params.get('serial')); }
      if (params.get('batch')) { setMode('batch'); setQuery(params.get('batch')); }
    });
    apiJson('/api/admin/retail-inventory/locations').then((result) => setLocations(result.locations || [])).catch(() => {});
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setData((previous) => ({ ...previous, loading: true }));
      const params = new URLSearchParams({ mode, q: query, state, location_id: location, page: String(page), page_size: '40' });
      apiJson(`/api/admin/retail-inventory/tracking?${params}`, { signal: controller.signal })
        .then((result) => { if (!controller.signal.aborted) setData({ ...result, loading: false }); })
        .catch((cause) => { if (!controller.signal.aborted) setData({ rows: [], loading: false, error: cause.error || 'Could not load tracking records.' }); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [mode, query, state, location, page]);
  const change = (setter) => (value) => { setter(value); setPage(1); };
  return <AdminLayout><div className="commerce-page"><WorkspaceHeader title="Tracking" description="Batch, expiry and serial identities" />
    <div className="commerce-filters"><label>Identity<select value={mode} onChange={(event) => { setMode(event.target.value); setState(''); setPage(1); }}><option value="batch">Batches & expiry</option><option value="serial">Serial numbers</option></select></label><label>Search product, SKU or identity<input value={query} onChange={(event) => change(setQuery)(event.target.value)} /></label><label>State<select value={state} onChange={(event) => change(setState)(event.target.value)}><option value="">All</option>{(mode === 'batch' ? ['EXPIRING','EXPIRED','QUARANTINED'] : ['IN_STOCK','RESERVED','SOLD','RETURNED','QUARANTINE','DAMAGED','RETURNED_TO_SUPPLIER']).map((value) => <option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label><label>Location<select value={location} onChange={(event) => change(setLocation)(event.target.value)}><option value="">All</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
    <DataTable rows={data.rows} loading={data.loading} error={data.error} onRowOpen={setSelected} pageInfo={data.pagination && { page, pages: data.pagination.total_pages, total: data.pagination.total }} onPageChange={setPage} columns={mode === 'batch' ? [
      { key: 'product_name', label: 'Product' }, { key: 'sku', label: 'SKU' }, { key: 'batch_number', label: 'Batch', render: (row) => <button className="text-blue-700" onClick={() => setSelected(row)}>{row.batch_number}</button> },
      { key: 'supplier_name', label: 'Supplier' }, { key: 'received_at', label: 'Received' }, { key: 'expiry_date', label: 'Expiry' }, { key: 'location_name', label: 'Location' },
      { key: 'quantity_on_hand', label: 'On hand', numeric: true, render: (row) => <Quantity value={row.quantity_on_hand} /> },
      { key: 'status', label: 'State', render: (row) => <StatusBadge tone={row.location_code === 'QUARANTINE' || (row.expiry_date && row.expiry_date < new Date().toISOString().slice(0,10)) ? 'warning' : 'neutral'}>{row.location_code === 'QUARANTINE' ? 'Quarantined' : row.status}</StatusBadge> },
      ...(can('retail_inventory.view_cost') ? [{ key: 'inventory_value', label: 'Value', numeric: true, render: (row) => <Money value={row.inventory_value} /> }] : []),
    ] : [
      { key: 'serial_number', label: 'Serial', render: (row) => <button className="text-blue-700" onClick={() => setSelected(row)}>{row.serial_number}</button> },
      { key: 'product_name', label: 'Product' }, { key: 'sku', label: 'SKU' }, { key: 'status', label: 'Status', render: (row) => <StatusBadge>{row.status}</StatusBadge> },
      { key: 'location_name', label: 'Location' }, { key: 'supplier_name', label: 'Supplier' }, { key: 'received_at', label: 'Received' },
      ...(can('retail_inventory.view_cost') ? [{ key: 'unit_cost', label: 'Purchase cost', numeric: true, render: (row) => <Money value={row.unit_cost} /> }] : []),
    ]} />
    <ActionDrawer open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }} title={selected ? (mode === 'batch' ? selected.batch_number : selected.serial_number) : 'Tracking detail'} description={selected?.product_name}>{selected && <TrackingDetail key={`${mode}-${selected.id}`} row={selected} mode={mode} />}</ActionDrawer>
  </div></AdminLayout>;
}
