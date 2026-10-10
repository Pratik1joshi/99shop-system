'use client';
import { useState } from 'react';
import { Percent, X } from 'lucide-react';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';
import { ActionDrawer } from '@/components/erp/primitives';
import { Field, Notice, SearchPicker, inputClass, primaryButton, secondaryButton } from './catalog-ui';

const blank = { category: null, supplier: null, brand: '', minimum_price: '', maximum_price: '', mode: 'percent', amount: 5, round_to: 1, reason: 'Bulk price change' };

function Chosen({ label, value, onClear }) {
  return <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"><span><span className="text-gray-500">{label}:</span> <span className="font-medium text-gray-900">{value}</span></span><button type="button" aria-label={`Clear ${label}`} onClick={onClear} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" aria-hidden /></button></div>;
}

export default function MassPricing({ onSaved }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(blank);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const edit = (patch) => { setDraft((d) => ({ ...d, ...patch })); setPreview(null); };
  const payload = () => ({ category_id: draft.category?.id || null, supplier_id: draft.supplier?.id || null, brand: draft.brand, minimum_price: draft.minimum_price, maximum_price: draft.maximum_price, mode: draft.mode, amount: draft.amount, round_to: draft.round_to, reason: draft.reason });
  async function run(fn) { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e.error || e.message || 'Price update failed.'); } finally { setBusy(false); } }

  return (
    <>
      <button type="button" className={secondaryButton} onClick={() => { setDraft(blank); setPreview(null); setOpen(true); }}><Percent className="h-4 w-4" aria-hidden /> Bulk price change</button>
      <ActionDrawer open={open} onOpenChange={setOpen} title="Bulk price change" description="Change many normal prices at once. You see every old and new price before anything is saved. Stock costs are not touched."
        footer={preview
          ? <button type="button" className={`${primaryButton} w-full`} disabled={busy || !preview.rows.length} onClick={() => run(async () => { await apiJson('/api/admin/commerce/pricing', { method: 'POST', body: JSON.stringify({ action: 'apply_mass', job_id: preview.id }) }); setOpen(false); setPreview(null); await onSaved(); })}>Confirm {preview.rows.length} new price{preview.rows.length === 1 ? '' : 's'}</button>
          : <button type="button" className={`${primaryButton} w-full`} disabled={busy || !draft.reason.trim()} onClick={() => run(async () => setPreview(await apiJson('/api/admin/commerce/pricing', { method: 'POST', body: JSON.stringify({ action: 'preview_mass', ...payload() }) })))}>{busy ? 'Checking…' : 'Preview changes'}</button>}>
        <div className="space-y-5">
          <Notice onClose={() => setError('')}>{error}</Notice>
          <section className="space-y-3">
            <p className="text-sm font-semibold text-gray-900">1. Which products?</p>
            <p className="text-xs text-gray-500">Leave everything blank to include all products. Filters combine.</p>
            {draft.category ? <Chosen label="Category" value={draft.category.title} onClear={() => edit({ category: null })} /> : <SearchPicker group="categories" placeholder="Category (optional)" onPick={(row) => edit({ category: row })} />}
            {draft.supplier ? <Chosen label="Supplier" value={draft.supplier.title} onClear={() => edit({ supplier: null })} /> : <SearchPicker group="suppliers" placeholder="Supplier (optional)" onPick={(row) => edit({ supplier: row })} />}
            <Field label="Brand (optional)"><input className={inputClass} value={draft.brand} onChange={(e) => edit({ brand: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Current price from"><input type="number" min="0" className={inputClass} value={draft.minimum_price} onChange={(e) => edit({ minimum_price: e.target.value })} placeholder="Any" /></Field>
              <Field label="Current price to"><input type="number" min="0" className={inputClass} value={draft.maximum_price} onChange={(e) => edit({ maximum_price: e.target.value })} placeholder="Any" /></Field>
            </div>
          </section>
          <section className="space-y-3">
            <p className="text-sm font-semibold text-gray-900">2. What change?</p>
            <div className="grid grid-cols-2 gap-2">
              {[['percent', 'Raise or lower by %', 'Use −10 for a 10% cut'], ['fixed', 'Set one fixed price', 'Every matching product gets it']].map(([mode, label, hint]) => (
                <button key={mode} type="button" aria-pressed={draft.mode === mode} onClick={() => edit({ mode })} className={`rounded-xl border-2 p-3 text-left ${draft.mode === mode ? 'border-gray-900 bg-gray-50' : 'border-gray-200'}`}><span className="block text-sm font-semibold text-gray-900">{label}</span><span className="text-xs text-gray-500">{hint}</span></button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={draft.mode === 'percent' ? 'Change %' : 'New price (Rs)'}><input type="number" className={inputClass} value={draft.amount} onChange={(e) => edit({ amount: e.target.value })} /></Field>
              <Field label="Round to nearest" hint="1 = whole rupees."><select className={inputClass} value={draft.round_to} onChange={(e) => edit({ round_to: e.target.value })}>{[['0.01', 'Paisa (0.01)'], ['1', 'Rs 1'], ['5', 'Rs 5'], ['10', 'Rs 10']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            </div>
            <Field label="Note for the change log"><input className={inputClass} value={draft.reason} onChange={(e) => edit({ reason: e.target.value })} /></Field>
          </section>
          {preview && (
            <section className="space-y-2">
              <p className="text-sm font-semibold text-gray-900">3. Check before saving — {preview.rows.length} price{preview.rows.length === 1 ? '' : 's'} will change</p>
              <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
                {preview.rows.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium text-gray-900">{row.name}</span><span className="text-xs text-gray-500">{row.sku}{row.before_margin !== undefined ? ` · margin ${row.before_margin ?? '—'}% → ${row.after_margin ?? '—'}%` : ''}</span></span>
                    <span className="shrink-0 text-right tabular-nums"><span className="text-gray-400 line-through">{formatCurrency(row.before_price)}</span> <span className="font-semibold text-gray-900">{formatCurrency(row.price)}</span><span className={`block text-xs ${Number(row.difference) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{Number(row.difference) > 0 ? '+' : ''}{formatCurrency(row.difference)}</span></span>
                  </li>
                ))}
                {!preview.rows.length && <li className="px-3 py-6 text-center text-sm text-gray-500">No products match these filters.</li>}
              </ul>
              <button type="button" className="text-xs font-semibold text-gray-600 hover:underline" onClick={() => setPreview(null)}>Change the filters</button>
            </section>
          )}
        </div>
      </ActionDrawer>
    </>
  );
}
