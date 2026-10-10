'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import { Button } from '@/components/ui/button';
import { apiJson } from '@/lib/authed-fetch';
import { useToast } from '@/components/ui/toast';
import { friendlyFromError } from '@/lib/friendly-message';
import ProductVariantPicker from '@/components/commerce/product-variant-picker';

const STATUS_BADGE = {
  COUNTING: 'bg-amber-100 text-amber-800', REVIEW: 'bg-blue-100 text-blue-800',
  POSTED: 'bg-emerald-100 text-emerald-800', CANCELLED: 'bg-red-100 text-red-700',
};

export default function RetailStockCountsPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [rows, setRows] = useState(undefined);
  const [showNew, setShowNew] = useState(false);
  const [locations, setLocations] = useState([]);

  const load = useCallback(() => {
    apiJson('/api/admin/retail-stock-counts').then((d) => setRows(d.retail_stock_counts || [])).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { apiJson('/api/admin/retail-inventory/locations').then((d) => setLocations(d.locations || [])).catch(() => {}); }, []);

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Stock Counts</h1>
          <Button onClick={() => setShowNew(true)}><Plus className="w-4 h-4 mr-1" /> New Count</Button>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {rows === undefined ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : rows.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-10">No stock counts yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2">Count #</th>
                  <th className="text-left px-4 py-2">Location</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-right px-4 py-2">Items</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Started</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/admin/retail-stock-counts/${c.id}`)}>
                    <td className="px-4 py-2 font-medium text-blue-700">{c.count_number}</td>
                    <td className="px-4 py-2 text-gray-600">{c.location_name}</td>
                    <td className="px-4 py-2 text-gray-600">{c.count_type}{c.blind ? ' · blind' : ''}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{c.line_count}</td>
                    <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[c.status] || 'bg-gray-100'}`}>{c.status}</span></td>
                    <td className="px-4 py-2 text-gray-600">{c.started_at ? new Date(c.started_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showNew && (
        <NewCountModal
          locations={locations}
          onClose={() => setShowNew(false)}
          onCreated={(c) => { setShowNew(false); router.push(`/admin/retail-stock-counts/${c.id}`); }}
          notifyError={(e) => addToast(friendlyFromError(e, 'save_failed'))}
        />
      )}
    </AdminLayout>
  );
}

function NewCountModal({ locations, onClose, onCreated, notifyError }) {
  const [locationId, setLocationId] = useState('');
  const [countType, setCountType] = useState('LOCATION');
  const [blind, setBlind] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState([]);
  const [cycleItems, setCycleItems] = useState([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    apiJson('/api/admin/commerce/search?group=categories&limit=40&q=')
      .then((data) => setCategories(data.groups[0]?.results || [])).catch(() => setCategories([]));
  }, []);

  const submit = async () => {
    if (!locationId) return notifyError({ message: 'Choose a location.' });
    if (countType === 'CATEGORY' && !categoryId) return notifyError({ message: 'Choose a category.' });
    if (countType === 'CYCLE' && !cycleItems.length) return notifyError({ message: 'Choose at least one product.' });
    setBusy(true);
    try {
      const created = await apiJson('/api/admin/retail-stock-counts', {
        method: 'POST', body: JSON.stringify({ location_id: Number(locationId), count_type: countType, blind, notes,
          category_id: countType === 'CATEGORY' ? Number(categoryId) : null,
          variant_ids: countType === 'CYCLE' ? cycleItems.map((item) => item.id) : null }),
      });
      onCreated(created.retail_stock_count);
    } catch (e) { notifyError(e); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-2xl bg-white p-6">
        <h3 className="mb-4 text-lg font-bold text-gray-900">New Stock Count</h3>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-500">Location</span>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5">
              <option value="">Choose…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-500">Count type</span>
            <select value={countType} onChange={(e) => setCountType(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5">
              <option value="LOCATION">Full location</option>
              <option value="FULL">Full</option>
              <option value="CYCLE">Cycle / selected SKUs</option>
              <option value="CATEGORY">Category</option>
            </select>
          </label>
          {countType === 'CATEGORY' && <label className="block text-sm"><span className="text-gray-500">Category</span><select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 p-2"><option value="">Choose…</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.title}</option>)}</select></label>}
          {countType === 'CYCLE' && <div className="space-y-2"><p className="text-sm font-medium text-gray-700">Products and variants to count</p><ProductVariantPicker onPick={(row) => setCycleItems((current) => current.some((item) => item.id === row.id) ? current : [...current, row])} selectedIds={cycleItems.map((item) => item.id)} />{cycleItems.map((row) => <p key={row.id} className="flex justify-between rounded bg-gray-50 p-2 text-xs text-gray-700"><span>{row.title} · {row.variant_name || 'Standard'}</span><button type="button" className="text-red-700 underline" onClick={() => setCycleItems((current) => current.filter((item) => item.id !== row.id))}>Remove</button></p>)}</div>}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} /> Blind count (hide expected quantity from the counter)
          </label>
          <label className="block text-sm">
            <span className="text-gray-500">Notes (optional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
          </label>
        </div>
        <div className="mt-5 flex gap-3">
          <Button className="flex-1" disabled={busy} onClick={submit}>{busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Start Counting</Button>
          <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-300">Cancel</button>
        </div>
      </div>
    </div>
  );
}
