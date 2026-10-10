'use client';
import { useState } from 'react';
import { X } from 'lucide-react';
import { apiJson } from '@/lib/authed-fetch';
import { Field, Notice, Panel, SearchPicker, inputClass, primaryButton } from './catalog-ui';

const OPERATIONS = [['enable', 'Show online'], ['disable', 'Hide from online'], ['feature', 'Feature on home page'], ['unfeature', 'Stop featuring'], ['category', 'Move to an online category']];

/** Bulk online visibility for a hand-picked set of products. */
export default function OnlinePublishing() {
  const [selected, setSelected] = useState([]);
  const [operation, setOperation] = useState('enable');
  const [reason, setReason] = useState('Online publishing');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pick = (row) => setSelected((current) => current.some((s) => s.id === row.product_id) ? current : [...current, { id: row.product_id, name: row.title }]);
  async function chooseOperation(value) {
    setOperation(value);
    if (value === 'category' && !categories.length) {
      try { setCategories((await apiJson('/api/admin/commerce/catalog-setup')).categories); } catch { setError('Could not load categories.'); }
    }
  }
  return (
    <Panel title="4. Products shown online" description="Choose products, then publish, hide or feature them. A product and its category must both be active to appear.">
      <div className="space-y-5">
        <Notice onClose={() => setError('')}>{error}</Notice>
        <Notice tone="success" onClose={() => setMessage('')}>{message}</Notice>
        <div><p className="mb-2 text-sm font-semibold text-gray-900">Select products</p><SearchPicker dedupe="product_id" placeholder="Search a product by name…" onPick={pick} renderRow={(row) => <><span className="font-medium text-gray-900">{row.title}</span><span className="text-xs text-gray-500">{row.category_name || ''}</span></>} /></div>
        <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
          {selected.map((p) => <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 py-1 pl-3 pr-1.5 text-sm text-gray-800">{p.name}<button type="button" aria-label={`Remove ${p.name}`} onClick={() => setSelected(selected.filter((s) => s.id !== p.id))} className="rounded-full p-0.5 hover:bg-gray-200"><X className="h-3.5 w-3.5" aria-hidden /></button></span>)}
          {!selected.length && <p className="text-sm text-gray-500">Selected products will appear here.</p>}
        </div>
        <div className="grid gap-3 rounded-xl border border-gray-200 p-4 md:grid-cols-2">
          <Field label="Action"><select className={inputClass} value={operation} onChange={(e) => chooseOperation(e.target.value)}>{OPERATIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></Field>
          {operation === 'category' && <Field label="Online category"><select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Choose…</option>{categories.filter((c) => Number(c.online_enabled) && Number(c.is_active)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
          <Field label="Note for the change log" className="md:col-span-2"><input maxLength={500} className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </div>
        <button type="button" className={primaryButton} disabled={busy || !selected.length || !reason.trim() || (operation === 'category' && !category)} onClick={async () => {
          setBusy(true); setError('');
          try { const r = await apiJson('/api/admin/commerce/storefront', { method: 'POST', body: JSON.stringify({ action: 'bulk_online', product_ids: selected.map((p) => p.id), operation, category_id: category, reason }) }); setMessage(`${r.count} product${r.count === 1 ? '' : 's'} updated.`); setSelected([]); }
          catch (e) { setError(e.message || e.error || 'Could not update.'); } finally { setBusy(false); }
        }}>{operation === 'enable' ? 'Show' : operation === 'disable' ? 'Hide' : 'Apply to'} {selected.length} product{selected.length === 1 ? '' : 's'}</button>
      </div>
    </Panel>
  );
}
