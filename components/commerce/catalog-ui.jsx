'use client';

/**
 * Small shared pieces for the Catalog pages, in the admin's visual
 * language (white header band, rounded-2xl cards, gray-900 primary buttons).
 */
import { useState } from 'react';
import { ImagePlus, Loader2, Search, X } from 'lucide-react';
import { apiJson } from '@/lib/authed-fetch';
import { useCommerceSearch } from './use-commerce-search';
import { formatCurrency } from '@/lib/currency';

export const inputClass = 'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 disabled:bg-gray-50 disabled:text-gray-500';
export const textareaClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10';
export const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40';
export const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40';
export const smallButton = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40';

export function PageHeader({ icon: Icon, tone = 'text-gray-700 bg-gray-100', title, description, actions }) {
  return (
    <header className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          {Icon && <div className={`rounded-xl p-2.5 ${tone}`}><Icon className="h-6 w-6" aria-hidden /></div>}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{title}</h1>
            {description && <p className="mt-1 max-w-3xl text-sm text-gray-500">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Page({ children }) {
  return <div className="space-y-5 bg-gray-50 p-4 sm:p-6 lg:p-8">{children}</div>;
}

export function Panel({ title, description, actions, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            {title && <h2 className="text-base font-semibold text-gray-900">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs leading-relaxed text-gray-500">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-gray-200 bg-white p-3 hover:bg-gray-50">
      <span>
        <span className="block text-sm font-semibold text-gray-900">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-gray-500">{description}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 ${checked ? 'bg-emerald-600' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </span>
    </label>
  );
}

export function Badge({ tone = 'gray', children }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700', green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-800',
    blue: 'bg-blue-50 text-blue-700', rose: 'bg-rose-50 text-rose-700', violet: 'bg-violet-50 text-violet-700',
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tones[tone] || tones.gray}`}>{children}</span>;
}

export function EmptyHint({ icon: Icon, title, children, action }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
      {Icon && <Icon className="mx-auto mb-3 h-10 w-10 text-gray-300" aria-hidden />}
      <p className="font-semibold text-gray-800">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-gray-500">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Notice({ tone = 'error', children, onClose }) {
  const tones = { error: 'border-red-200 bg-red-50 text-red-800', success: 'border-emerald-200 bg-emerald-50 text-emerald-800', info: 'border-blue-200 bg-blue-50 text-blue-800' };
  if (!children) return null;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      <span>{children}</span>
      {onClose && <button type="button" onClick={onClose} aria-label="Dismiss" className="opacity-70 hover:opacity-100"><X className="h-4 w-4" aria-hidden /></button>}
    </div>
  );
}

/**
 * Search box with a result list. `group` is a commerce search group
 * (products, customers, suppliers, categories). onPick receives the row.
 */
export function SearchPicker({ group = 'products', label, placeholder, onPick, renderRow, limit = 10, autoFocus = false, dedupe = null }) {
  const [query, setQuery] = useState('');
  const search = useCommerceSearch(query, { group, limit, enabled: !!query.trim() });
  const found = query.trim() ? search.groups.flatMap((g) => g.results) : [];
  const rows = dedupe ? [...new Map(found.map((row) => [row[dedupe], row])).values()] : found;
  return (
    <div className="relative">
      {label && <span className="mb-1.5 block text-sm font-medium text-gray-700">{label}</span>}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <input autoFocus={autoFocus} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label={label || placeholder} className={`${inputClass} pl-9`} />
        {search.loading && query.trim() && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" aria-hidden />}
      </div>
      {rows.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
          {rows.map((row) => (
            <li key={`${group}-${dedupe ? row[dedupe] : row.id}`}>
              <button type="button" onClick={() => { onPick(row); setQuery(''); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50">
                {renderRow ? renderRow(row) : <DefaultRow row={row} group={group} />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() && !search.loading && !rows.length && <p className="mt-1 text-xs text-gray-500">Nothing found for “{query.trim()}”.</p>}
    </div>
  );
}

function DefaultRow({ row, group }) {
  if (group !== 'products') return <><span className="font-medium text-gray-900">{row.title}</span>{row.phone && <span className="text-xs text-gray-500">{row.phone}</span>}</>;
  return (
    <>
      <span className="min-w-0">
        <span className="block truncate font-medium text-gray-900">{row.title}{row.variant_name && row.variant_name !== 'Standard' ? ` · ${row.variant_name}` : ''}</span>
        <span className="block truncate text-xs text-gray-500">{[row.sku, row.barcode, row.category_name].filter(Boolean).join(' · ') || 'No SKU yet'}</span>
      </span>
      <span className="shrink-0 text-right text-xs"><span className="block font-semibold text-gray-900">{formatCurrency(row.price)}</span><span className="text-gray-500">{Number(row.available_stock || 0)} in stock</span></span>
    </>
  );
}

/** Uploads one image through /api/uploads/menu and returns its /uploads/menu/... path. */
export function ImageUploadButton({ onUploaded, label = 'Upload image' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <span className="inline-flex flex-col">
      <label className={`${smallButton} cursor-pointer`}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ImagePlus className="h-3.5 w-3.5" aria-hidden />}{busy ? 'Uploading…' : label}
        <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          setBusy(true); setError('');
          try {
            const form = new FormData();
            form.append('file', file);
            const result = await apiJson('/api/uploads/menu', { method: 'POST', body: form });
            onUploaded(result.url);
          } catch (e) { setError(e.error || 'Upload failed.'); } finally { setBusy(false); }
        }} />
      </label>
      {error && <span role="alert" className="mt-1 text-xs text-red-700">{error}</span>}
    </span>
  );
}
