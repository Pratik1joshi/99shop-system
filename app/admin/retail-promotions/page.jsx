'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import { Button } from '@/components/ui/button';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';
import { useToast } from '@/components/ui/toast';
import { friendlyFromError, friendlyMessage } from '@/lib/friendly-message';

const OFFER_TYPES = [
  { value: 'discount', label: 'Discount (%/fixed)' },
  { value: 'buy_x_get_y', label: 'Buy X Get Y free' },
  { value: 'quantity_price', label: 'Quantity price (N for Rs X)' },
  { value: 'quantity_discount', label: 'Quantity threshold discount' },
  { value: 'bundle', label: 'Bundle (fixed combo price)' },
];
const SCOPES = ['order', 'category', 'item', 'brand', 'variant'];

export default function RetailPromotionsPage() {
  const { addToast } = useToast();
  const [rows, setRows] = useState(undefined);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiJson('/api/admin/retail-promotions').then((d) => { setRows(d.promotions || []); setCategories(d.categories || []); }).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    apiJson('/api/admin/products?channel=pos').then((d) => setProducts(d.products || [])).catch(() => {});
  }, []);

  const [form, setForm] = useState({
    name: '', code: '', offer_type: 'discount', discount_type: 'percent', discount_value: '', scope: 'order',
    buy_quantity: 1, reward_quantity: 1, quantity_price_amount: '', minimum_order_amount: 0, target_ids: [], target_values: [],
    bundle_component_ids: [], stackable: false, priority: 0, auto_apply: true, starts_at: '', ends_at: '',
  });

  const submit = async () => {
    setBusy(true);
    try {
      await apiJson('/api/admin/retail-promotions', { method: 'POST', body: JSON.stringify(form) });
      addToast(friendlyMessage('save_success', { description: 'Promotion created.' }));
      setShowNew(false);
      setForm({ name: '', code: '', offer_type: 'discount', discount_type: 'percent', discount_value: '', scope: 'order', buy_quantity: 1, reward_quantity: 1, quantity_price_amount: '', minimum_order_amount: 0, target_ids: [], target_values: [], bundle_component_ids: [], stackable: false, priority: 0, auto_apply: true, starts_at: '', ends_at: '' });
      load();
    } catch (e) { addToast(friendlyFromError(e, 'save_failed')); }
    finally { setBusy(false); }
  };

  const toggleActive = async (row) => {
    try {
      await apiJson(`/api/admin/retail-promotions/${row.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !row.is_active }) });
      load();
    } catch (e) { addToast(friendlyFromError(e, 'save_failed')); }
  };

  const remove = async (row) => {
    try {
      await apiJson(`/api/admin/retail-promotions/${row.id}`, { method: 'DELETE' });
      load();
    } catch (e) { addToast(friendlyFromError(e, 'save_failed')); }
  };

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Retail Promotions</h1>
          <Button onClick={() => setShowNew(true)}><Plus className="w-4 h-4 mr-1" /> New Promotion</Button>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {rows === undefined ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : rows.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-10">No promotions yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-left px-4 py-2">Scope</th>
                  <th className="text-left px-4 py-2">Code</th>
                  <th className="text-right px-4 py-2">Uses</th>
                  <th className="text-right px-4 py-2">Saved</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium text-gray-900">{r.name}</td>
                    <td className="px-4 py-2 text-gray-600">{r.offer_type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2 text-gray-600">{r.scope}{r.stackable ? ' · stackable' : ''}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.code || '—'}</td>
                    <td className="px-4 py-2 text-right">{r.uses}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(r.saved)}</td>
                    <td className="px-4 py-2">
                      <button onClick={() => toggleActive(r)} className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
                        {r.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => remove(r)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showNew && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 max-h-[92dvh] overflow-y-auto space-y-3">
            <h3 className="text-lg font-bold text-gray-900">New Retail Promotion</h3>
            <label className="block text-sm"><span className="text-gray-500">Name</span>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
            </label>
            <label className="block text-sm"><span className="text-gray-500">Coupon code (leave blank for auto-apply)</span>
              <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm"><span className="text-gray-500">Offer type</span>
                <select value={form.offer_type} onChange={(e) => setForm((f) => ({ ...f, offer_type: e.target.value }))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5">
                  {OFFER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <label className="block text-sm"><span className="text-gray-500">Scope</span>
                <select value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5">
                  {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>

            {form.offer_type === 'discount' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm"><span className="text-gray-500">Discount type</span>
                  <select value={form.discount_type} onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value }))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5">
                    <option value="percent">Percent</option>
                    <option value="fixed">Fixed Rs</option>
                  </select>
                </label>
                <label className="block text-sm"><span className="text-gray-500">Value</span>
                  <input type="number" value={form.discount_value} onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
                </label>
              </div>
            )}
            {form.offer_type === 'quantity_discount' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm"><span className="text-gray-500">Min quantity</span>
                  <input type="number" value={form.buy_quantity} onChange={(e) => setForm((f) => ({ ...f, buy_quantity: e.target.value }))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
                </label>
                <label className="block text-sm"><span className="text-gray-500">Percent off</span>
                  <input type="number" value={form.discount_value} onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
                </label>
              </div>
            )}
            {form.offer_type === 'quantity_price' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm"><span className="text-gray-500">Group size (N)</span>
                  <input type="number" value={form.buy_quantity} onChange={(e) => setForm((f) => ({ ...f, buy_quantity: e.target.value }))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
                </label>
                <label className="block text-sm"><span className="text-gray-500">Price for N</span>
                  <input type="number" value={form.quantity_price_amount} onChange={(e) => setForm((f) => ({ ...f, quantity_price_amount: e.target.value }))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
                </label>
              </div>
            )}
            {form.offer_type === 'buy_x_get_y' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm"><span className="text-gray-500">Buy quantity</span>
                  <input type="number" value={form.buy_quantity} onChange={(e) => setForm((f) => ({ ...f, buy_quantity: e.target.value }))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
                </label>
                <label className="block text-sm"><span className="text-gray-500">Free quantity</span>
                  <input type="number" value={form.reward_quantity} onChange={(e) => setForm((f) => ({ ...f, reward_quantity: e.target.value }))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
                </label>
              </div>
            )}
            {form.offer_type === 'bundle' && (
              <>
                <label className="block text-sm"><span className="text-gray-500">Bundle price</span>
                  <input type="number" value={form.quantity_price_amount} onChange={(e) => setForm((f) => ({ ...f, quantity_price_amount: e.target.value }))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
                </label>
                <label className="block text-sm"><span className="text-gray-500">Component products (select 2+)</span>
                  <select multiple value={form.bundle_component_ids} onChange={(e) => setForm((f) => ({ ...f, bundle_component_ids: Array.from(e.target.selectedOptions, (o) => Number(o.value)) }))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5 h-28">
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              </>
            )}

            {form.scope === 'category' && (
              <label className="block text-sm"><span className="text-gray-500">Category</span>
                <select multiple value={form.target_ids} onChange={(e) => setForm((f) => ({ ...f, target_ids: Array.from(e.target.selectedOptions, (o) => Number(o.value)) }))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5 h-24">
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            {(form.scope === 'item' || form.scope === 'variant') && (
              <label className="block text-sm"><span className="text-gray-500">Products{form.scope === 'variant' ? ' (variant-level)' : ''}</span>
                <select multiple value={form.target_ids} onChange={(e) => setForm((f) => ({ ...f, target_ids: Array.from(e.target.selectedOptions, (o) => Number(o.value)) }))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5 h-28">
                  {form.scope === 'item'
                    ? products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)
                    : products.flatMap((p) => (p.variants || []).map((v) => <option key={v.id} value={v.id}>{p.name} · {v.variant_name}</option>))}
                </select>
              </label>
            )}
            {form.scope === 'brand' && (
              <label className="block text-sm"><span className="text-gray-500">Brand names (comma separated)</span>
                <input value={form.target_values.join(', ')} onChange={(e) => setForm((f) => ({ ...f, target_values: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
              </label>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm"><span className="text-gray-500">Starts</span>
                <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
              </label>
              <label className="block text-sm"><span className="text-gray-500">Ends</span>
                <input type="datetime-local" value={form.ends_at} onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
              </label>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.stackable} onChange={(e) => setForm((f) => ({ ...f, stackable: e.target.checked }))} /> Stackable</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.auto_apply} onChange={(e) => setForm((f) => ({ ...f, auto_apply: e.target.checked }))} disabled={!!form.code} /> Auto-apply</label>
              <label className="flex items-center gap-1.5 flex-1">Priority
                <input type="number" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className="w-16 border border-gray-300 rounded px-1.5 py-1" />
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <Button className="flex-1" disabled={busy} onClick={submit}>{busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Create</Button>
              <button type="button" onClick={() => setShowNew(false)} className="flex-1 rounded-lg bg-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-300">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
