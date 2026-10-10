'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/admin/admin-layout';
import { DataTable, Money, Quantity, WorkspaceHeader } from '@/components/erp/primitives';
import { apiJson } from '@/lib/authed-fetch';
import { useCapabilities } from '@/lib/use-capabilities';

const TYPES = ['OPENING_STOCK','PURCHASE_RECEIPT','SALE','CUSTOMER_RETURN','PURCHASE_RETURN','TRANSFER_OUT','TRANSFER_IN','STOCK_ADJUSTMENT_IN','STOCK_ADJUSTMENT_OUT','DAMAGE','EXPIRY','SHRINKAGE','TESTER','SAMPLE','INTERNAL_USE'];
function sourceLink(row) {
  const type = row.reference_type;
  const id = row.reference_id;
  if (!id) return null;
  if (type === 'retail_sale_line' || type === 'retail_return_line') return '/admin/retail-sales-history';
  if (type === 'goods_receipt_line') return '/admin/retail-goods-receipts';
  if (type === 'purchase_return_line') return '/admin/retail-purchase-returns';
  if (type?.startsWith('retail_transfer')) return '/admin/retail-transfers';
  if (type === 'retail_stock_count_post') return '/admin/retail-stock-counts';
  if (type === 'retail_inventory_adjustment') return '/admin/retail-inventory-ops';
  return null;
}

export default function RetailMovementPage() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [location, setLocation] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], loading: true });
  const [locations, setLocations] = useState([]);
  const { can } = useCapabilities();
  useEffect(() => { const frame = requestAnimationFrame(() => { const initialQuery = new URLSearchParams(window.location.search).get('q'); if (initialQuery) setQuery(initialQuery); }); return () => cancelAnimationFrame(frame); }, []);
  useEffect(() => { apiJson('/api/admin/retail-inventory/locations').then((result) => setLocations(result.locations || [])).catch(() => {}); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setData((previous) => ({ ...previous, loading: true }));
      const params = new URLSearchParams({ q: query, type, location_id: location, page: String(page), page_size: '40' });
      apiJson(`/api/admin/retail-inventory/movements?${params}`, { signal: controller.signal })
        .then((result) => { if (!controller.signal.aborted) setData({ ...result, loading: false }); })
        .catch((error) => { if (!controller.signal.aborted) setData({ rows: [], loading: false, error: error.error || 'Could not load movements.' }); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, type, location, page]);
  const change = (setter) => (value) => { setter(value); setPage(1); };
  return <AdminLayout><div className="commerce-page">
    <WorkspaceHeader title="Movements" description="Immutable stock events from sales, receipts, returns, transfers, counts and adjustments" />
    <div className="commerce-filters"><label>Product, SKU, batch or reference<input value={query} onChange={(event) => change(setQuery)(event.target.value)} /></label><label>Movement<select value={type} onChange={(event) => change(setType)(event.target.value)}><option value="">All types</option>{TYPES.map((value) => <option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label><label>Location<select value={location} onChange={(event) => change(setLocation)(event.target.value)}><option value="">All locations</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
    <DataTable rows={data.rows} loading={data.loading} error={data.error} pageInfo={data.pagination && { page, pages: data.pagination.total_pages, total: data.pagination.total }} onPageChange={setPage} columns={[
      { key: 'created_at', label: 'Timestamp' }, { key: 'product_name', label: 'Product / SKU', render: (row) => <span>{row.product_name}<small className="block text-slate-500">{row.sku || row.variant_name}{row.batch_number && ` · ${row.batch_number}`}</small></span> },
      { key: 'location_name', label: 'Location' }, { key: 'movement_type', label: 'Movement', render: (row) => row.movement_type.replaceAll('_',' ') },
      { key: 'quantity', label: 'Qty', numeric: true, render: (row) => <Quantity value={row.quantity} /> },
      { key: 'balance_before', label: 'Before', numeric: true, render: (row) => <Quantity value={row.balance_before} /> },
      { key: 'balance_after', label: 'After', numeric: true, render: (row) => <Quantity value={row.balance_after} /> },
      ...(can('retail_inventory.view_cost') ? [{ key: 'unit_cost', label: 'Unit cost', numeric: true, render: (row) => <Money value={row.unit_cost} /> }] : []),
      { key: 'reference_id', label: 'Reference', render: (row) => sourceLink(row) ? <Link href={sourceLink(row)} className="text-blue-700">{row.reference_type} #{row.reference_id}</Link> : (row.reference_type ? `${row.reference_type} #${row.reference_id}` : '—') },
      { key: 'actor', label: 'Actor' }, { key: 'reason', label: 'Reason' },
    ]} />
  </div></AdminLayout>;
}
