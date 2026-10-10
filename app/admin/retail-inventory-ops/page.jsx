'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import AdminLayout from '@/components/admin/admin-layout';
import { Button } from '@/components/ui/button';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';
import { useToast } from '@/components/ui/toast';
import { friendlyFromError, friendlyMessage } from '@/lib/friendly-message';
import ProductVariantPicker from '@/components/commerce/product-variant-picker';

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const TYPES = [
  { value: 'DAMAGE', label: 'Damage write-off', permission: 'retail_inventory.damage' },
  { value: 'EXPIRY', label: 'Expiry write-off', permission: 'retail_inventory.expiry' },
  { value: 'TESTER', label: 'Convert to tester', permission: 'retail_inventory.tester' },
  { value: 'SAMPLE', label: 'Sample / giveaway', permission: 'retail_inventory.sample' },
  { value: 'INTERNAL_USE', label: 'Internal use', permission: 'retail_inventory.internal_use' },
  { value: 'SHRINKAGE', label: 'Shrinkage / theft', permission: 'retail_inventory.adjust' },
  { value: 'MANUAL', label: 'Manual adjustment (+/-)', permission: 'retail_inventory.adjust' },
  { value: 'QUARANTINE_MOVE', label: 'Move to quarantine', permission: 'retail_inventory.quarantine_release' },
  { value: 'QUARANTINE_RELEASE', label: 'Release from quarantine', permission: 'retail_inventory.quarantine_release' },
];

const MANUAL_REASONS = ['DAMAGE', 'EXPIRY', 'SHRINKAGE', 'THEFT', 'FOUND_STOCK', 'COUNT_VARIANCE', 'DATA_CORRECTION', 'OTHER'];

export default function RetailInventoryOpsPage() {
  const { addToast } = useToast();
  const [capabilities, setCapabilities] = useState({});
  const [type, setType] = useState('DAMAGE');
  const [variant, setVariant] = useState(null);
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState('');
  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [stock, setStock] = useState(null);
  const [availableSerials, setAvailableSerials] = useState([]);
  const [serialInput, setSerialInput] = useState('');
  const [review, setReview] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [manualDirection, setManualDirection] = useState('remove');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState(undefined);

  useEffect(() => { apiJson('/api/auth/capabilities').then((d) => setCapabilities(d.capabilities || {})).catch(() => {}); }, []);
  useEffect(() => { apiJson('/api/admin/retail-inventory/locations').then((d) => {
    const options = (d.locations || []).filter((row) => row.code !== 'IN_TRANSIT');
    setLocations(options);
    setLocationId(String(options.find((row) => row.code === 'MAIN')?.id || options[0]?.id || ''));
  }).catch(() => {}); }, []);
  useEffect(() => { setReview(false); }, [variant, type, locationId, batchId, quantity, manualDirection, serialInput, reason, notes]);
  useEffect(() => {
    if (!variant || !locationId) { setStock(null); setBatches([]); setAvailableSerials([]); return; }
    let active = true;
    const sourceId = type === 'QUARANTINE_RELEASE'
      ? locations.find((row) => row.code === 'QUARANTINE')?.id : locationId;
    if (!sourceId) return;
    setStock(null); setBatches([]); setAvailableSerials([]);
    apiJson(`/api/admin/retail-inventory/workspace/${variant.variantId}?location_id=${sourceId}`)
      .then((data) => { if (active) { setStock(data.identity); setAvailableSerials(data.serials || []); } }).catch(() => { if (active) setStock(null); });
    if (variant.trackingMode === 'batch') apiJson(`/api/admin/retail-inventory/batches?variant_id=${variant.variantId}&location_id=${sourceId}`)
      .then((data) => { if (active) setBatches(data.batches || []); }).catch(() => { if (active) setBatches([]); });
    return () => { active = false; };
  }, [variant, type, locationId, locations]);

  const loadRows = useCallback(() => {
    apiJson('/api/admin/retail-inventory-adjustments').then((d) => setRows(d.retail_inventory_adjustments || [])).catch(() => setRows([]));
  }, []);
  useEffect(() => { loadRows(); }, [loadRows]);

  const pickVariant = (row) => {
    setVariant({ variantId: row.id, name: `${row.title}${row.variant_name && row.variant_name !== 'Standard' ? ` · ${row.variant_name}` : ''}`, trackingMode: row.tracking_mode });
    setBatches([]); setBatchId(''); setSerialInput('');
  };

  const submit = async () => {
    if (!variant) return addToast(friendlyMessage('validation', { description: 'Search and choose an item.' }));
    if (!locationId || !stock) return addToast(friendlyMessage('validation', { description: 'Choose a location and wait for its stock balance.' }));
    const serialNumbers = serialInput.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (variant.trackingMode === 'serial' && (!Number.isInteger(Math.abs(Number(quantity))) || serialNumbers.length !== Math.abs(Number(quantity)) || new Set(serialNumbers).size !== serialNumbers.length))
      return addToast(friendlyMessage('validation', { description: 'Enter one distinct serial identity for each unit.' }));
    if (variant.trackingMode === 'batch' && !batchId) return addToast(friendlyMessage('validation', { description: 'Choose the batch identity.' }));
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) return addToast(friendlyMessage('validation', { description: 'Enter a quantity greater than zero.' }));
    if (type === 'MANUAL' && !reason) return addToast(friendlyMessage('validation', { description: 'Choose a reason.' }));
    const current = variant.trackingMode === 'batch'
      ? Number(batches.find((row) => String(row.batch_id) === String(batchId))?.quantity_on_hand || 0)
      : Number(stock.on_hand || 0);
    if ((type !== 'MANUAL' || manualDirection === 'remove') && Number(quantity) > current)
      return addToast(friendlyMessage('validation', { description: 'Quantity exceeds stock at the selected location and batch.' }));
    if (!review) { setReview(true); return; }
    setBusy(true);
    try {
      await apiJson('/api/admin/retail-inventory-adjustments', {
        method: 'POST',
        body: JSON.stringify({
          type, variant_id: variant.variantId, batch_id: batchId || null,
          serial_numbers: variant.trackingMode === 'serial' ? serialNumbers : undefined,
          location_id: type === 'QUARANTINE_RELEASE' ? null : locationId,
          destination_location_id: type === 'QUARANTINE_RELEASE' ? locationId : null,
          quantity: type === 'MANUAL' && manualDirection === 'remove' ? -Number(quantity) : Number(quantity),
          reason: type === 'MANUAL' ? reason : (reason || undefined),
          notes, idempotency_key: uid(),
        }),
      });
      addToast(friendlyMessage('save_success', { description: 'Posted.' }));
      setVariant(null); setQuantity(''); setReason(''); setNotes(''); setBatchId(''); setSerialInput(''); setReview(false);
      loadRows();
    } catch (e) { addToast(friendlyFromError(e, 'save_failed')); }
    finally { setBusy(false); }
  };

  const availableTypes = TYPES.filter((t) => capabilities[t.permission]);

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Inventory Operations</h1>
        <p className="text-sm text-slate-600">Use adjustments for damage, missing stock and corrections. Purchased items go through a goods receipt so supplier and cost records stay complete.</p>
        <div className="grid gap-3 sm:grid-cols-3"><Link href="/admin/retail-goods-receipts" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">Receive purchased inventory<span className="mt-1 block font-normal">Supplier invoice and cost</span></Link><Link href="/admin/retail-stock-counts" className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-900">Count stock<span className="mt-1 block font-normal text-slate-600">Reconcile physical quantities</span></Link><Link href="/admin/retail-inventory-movements" className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-900">View all records<span className="mt-1 block font-normal text-slate-600">Receipts, sales and corrections</span></Link></div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
          <label className="block text-sm">
            <span className="text-gray-500">Action</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5">
              {(availableTypes.length ? availableTypes : TYPES).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>

          <div className="relative">
            <span className="text-sm text-gray-500">Product and variant</span>
            {variant ? (
              <div className="mt-1 flex items-center justify-between bg-blue-50 rounded-lg px-2 py-1.5 text-sm">
                <span>{variant.name}</span>
                <button type="button" onClick={() => setVariant(null)} className="text-blue-500 hover:text-blue-700">×</button>
              </div>
            ) : <div className="mt-1"><ProductVariantPicker onPick={pickVariant} /></div>}
          </div>

          <label className="block text-sm"><span className="text-gray-500">{type === 'QUARANTINE_RELEASE' ? 'Release to location' : 'Location'}</span>
            <select value={locationId} onChange={(e) => { setLocationId(e.target.value); setBatchId(''); }} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5">
              {locations.filter((row) => (type !== 'QUARANTINE_MOVE' && type !== 'QUARANTINE_RELEASE') || row.code !== 'QUARANTINE').map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>

          {variant?.trackingMode === 'batch' && (
            <label className="block text-sm">
              <span className="text-gray-500">Batch</span>
              <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5">
                <option value="">Choose…</option>
                {batches.map((b) => (
                  <option key={b.batch_id} value={b.batch_id}>{b.batch_number} — {b.quantity_on_hand} on hand{b.expiry_date ? ` · exp ${b.expiry_date}` : ''}</option>
                ))}
              </select>
            </label>
          )}

          {type === 'MANUAL' && <fieldset className="text-sm"><legend className="mb-2 font-medium text-slate-800">What happened?</legend><div className="grid grid-cols-2 gap-2">{[['add','Found extra stock'],['remove','Stock is missing']].map(([value,label]) => <button key={value} type="button" aria-pressed={manualDirection === value} onClick={() => setManualDirection(value)} className={`rounded-lg border p-3 text-left font-medium ${manualDirection === value ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-slate-300 text-slate-700'}`}>{label}</button>)}</div></fieldset>}
          <label className="block text-sm">
            <span className="font-medium text-slate-800">Quantity to {type === 'MANUAL' ? manualDirection === 'add' ? 'add' : 'remove' : 'process'}</span>
            <input type="number" min={variant?.trackingMode === 'serial' ? '1' : '0.001'} step={variant?.trackingMode === 'serial' ? '1' : '0.001'} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2.5" />
            <small className="mt-1 block text-slate-500">Enter a positive number.</small>
          </label>

          {variant?.trackingMode === 'serial' && <label className="block text-sm"><span className="text-gray-500">Exact serial identities</span>
            <textarea rows={3} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" placeholder="Scan or paste serials, separated by spaces" value={serialInput} onChange={(e) => setSerialInput(e.target.value)} />
            <small>{serialInput.split(/[\s,]+/).filter(Boolean).length} / {Math.abs(Number(quantity || 0))} captured. Available here: {availableSerials.filter((row) => ['IN_STOCK','QUARANTINE'].includes(row.status)).map((row) => row.serial_number).join(', ') || 'none'}</small>
          </label>}

          {type === 'MANUAL' ? (
            <label className="block text-sm">
              <span className="text-gray-500">Reason</span>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5">
                <option value="">Choose…</option>
                {MANUAL_REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
          ) : type === 'SHRINKAGE' ? (
            <label className="block text-sm">
              <span className="text-gray-500">Reason</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. THEFT" className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
            </label>
          ) : (
            <label className="block text-sm">
              <span className="text-gray-500">Reason (optional)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
            </label>
          )}

          <label className="block text-sm">
            <span className="text-gray-500">Notes (optional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
          </label>

          {variant && stock && <div className="rounded-xl bg-slate-50 p-3 text-sm" role="status"><p>Current stock at {stock.location_name}: <strong>{variant.trackingMode === 'batch' ? Number(batches.find((row) => String(row.batch_id) === String(batchId))?.quantity_on_hand || 0) : Number(stock.on_hand || 0)}</strong></p><p>{type === 'MANUAL' && manualDirection === 'add' ? 'Adding' : 'Removing'}: <strong>{Number(quantity || 0)}</strong></p><p>Resulting stock: <strong>{(variant.trackingMode === 'batch' ? Number(batches.find((row) => String(row.batch_id) === String(batchId))?.quantity_on_hand || 0) : Number(stock.on_hand || 0)) + (type === 'MANUAL' && manualDirection === 'add' ? Number(quantity || 0) : -Number(quantity || 0))}</strong></p>{capabilities['retail_inventory.view_cost'] && stock.current_cost != null && <p>Estimated value impact: {formatCurrency(Math.abs(Number(quantity || 0) * Number(stock.current_cost)))}</p>}</div>}
          {review && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm" role="status">Review {TYPES.find((row) => row.value === type)?.label}, {Math.abs(Number(quantity))} unit(s) of {variant?.name} at {stock?.location_name}. Reason: {reason || type}. Posting changes the inventory ledger immediately.</p>}
          <Button className="w-full" disabled={busy} onClick={submit}>{busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}{review ? 'Confirm and post' : 'Review adjustment'}</Button>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <h2 className="px-4 py-3 text-sm font-semibold text-gray-700 border-b border-gray-100">Recent activity</h2>
          {rows === undefined ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : rows.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">No activity yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2">#</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-left px-4 py-2">Item</th>
                  <th className="text-right px-4 py-2">Qty</th>
                  <th className="text-right px-4 py-2">Value</th>
                  <th className="text-left px-4 py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-900">{r.adjustment_number}</td>
                    <td className="px-4 py-2 text-gray-600">{r.type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2 text-gray-600">{r.product_name ? `${r.product_name}${r.variant_name ? ` · ${r.variant_name}` : ''}` : r.variant_name}</td>
                    <td className="px-4 py-2 text-right">{r.quantity}</td>
                    <td className="px-4 py-2 text-right">{r.total_value ? formatCurrency(r.total_value) : '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{new Date(r.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
