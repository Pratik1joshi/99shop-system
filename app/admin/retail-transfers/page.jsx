'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Search, X } from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import { Button } from '@/components/ui/button';
import { apiJson } from '@/lib/authed-fetch';
import { useToast } from '@/components/ui/toast';
import { friendlyFromError } from '@/lib/friendly-message';

const STATUS_BADGE = {
  DRAFT: 'bg-gray-100 text-gray-600', DISPATCHED: 'bg-amber-100 text-amber-800',
  RECEIVED: 'bg-emerald-100 text-emerald-800', CANCELLED: 'bg-red-100 text-red-700',
};

export default function RetailTransfersPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [rows, setRows] = useState(undefined);
  const [showNew, setShowNew] = useState(false);
  const [locations, setLocations] = useState([]);

  const load = useCallback(() => {
    apiJson('/api/admin/retail-transfers').then((d) => setRows(d.retail_transfers || [])).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { apiJson('/api/admin/retail-inventory/locations').then((d) => setLocations(d.locations || [])).catch(() => {}); }, []);

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Stock Transfers</h1>
          <Button onClick={() => setShowNew(true)}><Plus className="w-4 h-4 mr-1" /> New Transfer</Button>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {rows === undefined ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : rows.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-10">No transfers yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2">Transfer #</th>
                  <th className="text-left px-4 py-2">Source</th>
                  <th className="text-left px-4 py-2">Destination</th>
                  <th className="text-right px-4 py-2">Lines</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Requested</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/admin/retail-transfers/${t.id}`)}>
                    <td className="px-4 py-2 font-medium text-blue-700">{t.transfer_number}</td>
                    <td className="px-4 py-2 text-gray-600">{t.source_name}</td>
                    <td className="px-4 py-2 text-gray-600">{t.destination_name}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{t.line_count}</td>
                    <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[t.status] || 'bg-gray-100'}`}>{t.status}</span></td>
                    <td className="px-4 py-2 text-gray-600">{t.requested_at ? new Date(t.requested_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showNew && (
        <NewTransferModal
          locations={locations}
          onClose={() => setShowNew(false)}
          onCreated={(t) => { setShowNew(false); router.push(`/admin/retail-transfers/${t.id}`); }}
          notifyError={(e) => addToast(friendlyFromError(e, 'save_failed'))}
        />
      )}
    </AdminLayout>
  );
}

function NewTransferModal({ locations, onClose, onCreated, notifyError }) {
  const [sourceId, setSourceId] = useState('');
  const [destId, setDestId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [product, setProduct] = useState(null);
  const [variants, setVariants] = useState([]);
  const [findingVariants, setFindingVariants] = useState(false);
  const [variantError, setVariantError] = useState('');
  const lookupId = useRef(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sourceId || product || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiJson(`/api/admin/commerce/search?group=product_families&limit=12&q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((data) => { if (!controller.signal.aborted) setResults(data.groups[0]?.results || []); })
        .catch(() => { if (!controller.signal.aborted) setResults([]); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [sourceId, product, query]);

  const chooseProduct = async (row) => {
    const requestId = ++lookupId.current;
    setProduct(row); setResults([]); setQuery(''); setVariants([]); setVariantError(''); setFindingVariants(true);
    try {
      const data = await apiJson(`/api/admin/commerce/search?group=product_variants&productId=${row.id}&locationId=${sourceId}`);
      if (requestId === lookupId.current) setVariants(data.groups[0]?.results || []);
    } catch (error) { if (requestId === lookupId.current) setVariantError(error.error || 'Could not load variants.'); }
    finally { if (requestId === lookupId.current) setFindingVariants(false); }
  };

  const addLine = async (row) => {
    if (!sourceId) return notifyError({ message: 'Choose a source location first.' });
    let batches = []; let serialChoices = [];
    try {
      if (row.trackingMode === 'batch') batches = (await apiJson(`/api/admin/retail-inventory/batches?variant_id=${row.variantId}&location_id=${sourceId}`)).batches || [];
      if (row.trackingMode === 'serial') serialChoices = (await apiJson(`/api/admin/retail-serials?variantId=${row.variantId}&location_id=${sourceId}`)).serials || [];
    } catch (error) { return notifyError(error); }
    setLines((prev) => prev.some((l) => l.variantId === row.variantId) ? prev : [...prev, { variantId: row.variantId, name: row.name,
      trackingMode: row.trackingMode, quantity: 1, batchId: '', serialNumbers: '', batches, serialChoices }]);
  };

  const submit = async () => {
    if (!sourceId || !destId) return notifyError({ message: 'Choose a source and destination location.' });
    if (sourceId === destId) return notifyError({ message: 'Source and destination must differ.' });
    if (!lines.length) return notifyError({ message: 'Add at least one item.' });
    setBusy(true);
    try {
      const created = await apiJson('/api/admin/retail-transfers', {
        method: 'POST',
        body: JSON.stringify({
          source_location_id: Number(sourceId), destination_location_id: Number(destId), notes,
          lines: lines.map((l) => ({ variantId: l.variantId, quantity: Number(l.quantity), batchId: l.batchId || null,
            serialNumbers: String(l.serialNumbers || '').split(/[\s,]+/).filter(Boolean) })),
        }),
      });
      onCreated(created.retail_transfer);
    } catch (e) { notifyError(e); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 max-h-[92dvh] overflow-y-auto">
        <h3 className="text-lg font-bold text-gray-900">New stock transfer</h3>
        <p className="mb-4 text-sm text-gray-500">Choose locations, then select a product and the exact variant to move.</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="block text-sm">
            <span className="text-gray-500">Source</span>
            <select value={sourceId} onChange={(e) => { lookupId.current += 1; setSourceId(e.target.value); setLines([]); setProduct(null); setVariants([]); setQuery(''); setResults([]); }} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5">
              <option value="">Choose…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-500">Destination</span>
            <select value={destId} onChange={(e) => setDestId(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5">
              <option value="">Choose…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        </div>

        <div className="mb-4 space-y-2">
          <label className="block text-sm font-medium text-gray-700">Product</label>
          {product ? <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm"><span className="font-semibold text-blue-950">{product.title}</span><button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => { lookupId.current += 1; setProduct(null); setVariants([]); setVariantError(''); }}>Change product</button></div> : <div className="relative"><div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3"><Search className="h-4 w-4 text-gray-400" aria-hidden /><input value={query} disabled={!sourceId} onChange={(e) => { setQuery(e.target.value); setResults([]); }} placeholder={sourceId ? 'Search product name, SKU or barcode…' : 'Choose source first'} className="w-full py-2.5 text-sm outline-none disabled:bg-white" /></div>{results.length > 0 && <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">{results.map((row) => <button key={row.id} type="button" onClick={() => chooseProduct(row)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"><span className="font-medium">{row.title}</span><span className="text-xs text-gray-500">{row.variant_count} variant{row.variant_count === 1 ? '' : 's'}</span></button>)}</div>}</div>}
          {findingVariants && <p role="status" className="text-sm text-gray-500">Loading variants…</p>}
          {variantError && <p role="alert" className="text-sm text-red-700">{variantError}</p>}
          {product && !findingVariants && !variantError && <div className="max-h-52 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">{variants.map((variant) => <button key={variant.id} type="button" disabled={lines.some((line) => line.variantId === variant.id) || Number(variant.on_hand) <= 0} onClick={() => addLine({ variantId: variant.id, name: `${product.title}${variant.variant_name && variant.variant_name !== 'Standard' ? ` · ${variant.variant_name}` : ''}`, trackingMode: variant.tracking_mode })} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50"><span><strong className="block">{variant.variant_name || 'Standard'}</strong><small className="text-gray-500">{variant.sku || `Variant #${variant.id}`}</small></span><span className="shrink-0 text-right text-xs text-gray-500"><strong className="block text-gray-800">{Number(variant.on_hand || 0)} on hand</strong>{lines.some((line) => line.variantId === variant.id) ? 'Added' : Number(variant.on_hand) <= 0 ? 'No stock here' : 'Add'}</span></button>)}</div>}
        </div>

        {lines.length > 0 && (
          <div className="space-y-2 mb-4">
            {lines.map((l) => (
              <div key={l.variantId} className="space-y-1 rounded-lg border border-gray-200 p-2 text-sm">
                <div className="flex items-center justify-between">
                <span>{l.name}</span>
                <div className="flex items-center gap-2">
                  <input aria-label={`Quantity for ${l.name}`} type="number" min="1" value={l.quantity} onChange={(e) => setLines((prev) => prev.map((x) => x.variantId === l.variantId ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))} className="w-16 border border-gray-300 rounded px-1.5 py-1" />
                  <button type="button" onClick={() => setLines((prev) => prev.filter((x) => x.variantId !== l.variantId))} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                </div>
                </div>
                {l.trackingMode === 'batch' && <label className="block text-xs">Original batch<select aria-label={`Batch for ${l.name}`} value={l.batchId} onChange={(e) => setLines((prev) => prev.map((x) => x.variantId === l.variantId ? { ...x, batchId: e.target.value } : x))} className="mt-1 w-full rounded border border-gray-300 p-1.5"><option value="">Choose batch</option>{l.batches.map((batch) => <option key={batch.batch_id} value={batch.batch_id}>{batch.batch_number} · {batch.quantity_on_hand} on hand</option>)}</select></label>}
                {l.trackingMode === 'serial' && <label className="block text-xs">Exact serial numbers<input aria-label={`Serials for ${l.name}`} value={l.serialNumbers} onChange={(e) => setLines((prev) => prev.map((x) => x.variantId === l.variantId ? { ...x, serialNumbers: e.target.value } : x))} className="mt-1 w-full rounded border border-gray-300 p-1.5" placeholder="Scan or paste serials, separated by spaces" /><small>Available: {l.serialChoices.map((serial) => serial.serial_number).join(', ') || 'none'}</small></label>}
              </div>
            ))}
          </div>
        )}

        <label className="block text-sm mb-4">
          <span className="text-gray-500">Notes (optional)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
        </label>

        <div className="flex gap-3">
          <Button className="flex-1" disabled={busy} onClick={submit}>{busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Create Draft</Button>
          <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-300">Cancel</button>
        </div>
      </div>
    </div>
  );
}
