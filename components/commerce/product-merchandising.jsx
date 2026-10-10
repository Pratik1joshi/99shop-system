'use client';
import { useEffect, useState } from 'react';
import { ArrowUp, ExternalLink, Trash2 } from 'lucide-react';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';
import { toPublicImageUrl } from '@/lib/public-image-url.js';
import { Field, ImageUploadButton, Notice, Panel, SearchPicker, Toggle, inputClass, primaryButton, smallButton, textareaClass } from './catalog-ui';

const TEXT_FIELDS = [
  ['online_title', 'Online title', 'Shown on the website instead of the shop name, if set.'],
  ['brand', 'Brand', ''],
  ['online_slug', 'Web address', 'e.g. pink-hair-clip → /store/product/pink-hair-clip'],
  ['online_summary', 'Short summary', 'One line under the title.'],
  ['seo_title', 'Search engine title', ''],
  ['seo_description', 'Search engine description', ''],
  ['online_sort', 'Sort order', 'Lower shows first.'],
];

export default function ProductMerchandising({ productId, variants }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('Update online details');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    apiJson(`/api/admin/commerce/product-merchandising?id=${productId}`).then((result) => { if (live) setData(result); }).catch((e) => { if (live) setError(e.error || 'Could not load product details.'); });
    return () => { live = false; };
  }, [productId]);
  if (!data) return <Panel title="Online, images & suppliers">{error ? <Notice>{error}</Notice> : <p className="text-sm text-gray-500">Loading…</p>}</Panel>;
  const edit = (key, value) => setData((current) => ({ ...current, product: { ...current.product, [key]: value } }));
  const setMedia = (media) => setData((current) => ({ ...current, media }));
  const setSuppliers = (suppliers) => setData((current) => ({ ...current, suppliers }));
  const savedVariants = variants.filter((v) => v.id);
  async function save() {
    setBusy(true); setError(''); setMessage('');
    try {
      await apiJson('/api/admin/commerce/product-merchandising', { method: 'POST', body: JSON.stringify({ ...data.product, product_id: productId, media: data.media, suppliers: data.suppliers, reason }) });
      setMessage('Online details saved.');
    } catch (e) { setError(e.error || e.message || 'Could not save.'); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <Notice onClose={() => setError('')}>{error}</Notice>
      <Notice tone="success" onClose={() => setMessage('')}>{message}</Notice>
      <Panel title="Online store" description="How this product appears on your website."
        actions={<a className={smallButton} href={`/admin/products/storefront/preview?id=${productId}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" aria-hidden /> Preview saved page</a>}>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle checked={!!Number(data.product.online_enabled)} onChange={(v) => edit('online_enabled', v ? 1 : 0)} label="Sell this online" description="Its category must also be shown online." />
          <Toggle checked={!!Number(data.product.featured)} onChange={(v) => edit('featured', v ? 1 : 0)} label="Feature on the home page" />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {TEXT_FIELDS.map(([field, label, hint]) => <Field key={field} label={label} hint={hint}><input className={inputClass} value={data.product[field] ?? ''} onChange={(e) => edit(field, e.target.value)} /></Field>)}
          <Field label="Description" className="md:col-span-2"><textarea rows={4} className={textareaClass} value={data.product.online_description || ''} onChange={(e) => edit('online_description', e.target.value)} /></Field>
        </div>
      </Panel>

      <Panel title="Images" description="The first image is the main one. Upload photos or paste an https:// link."
        actions={<><ImageUploadButton onUploaded={(url) => setMedia([...data.media, { url, alt: data.product.online_title || '', variant_id: null }])} /><button type="button" className={smallButton} onClick={() => setMedia([...data.media, { url: '', alt: '', variant_id: null }])}>Add by link</button></>}>
        {data.media.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.media.map((image, index) => (
              <div key={index} className={`space-y-2 rounded-xl border p-3 ${index === 0 ? 'border-gray-900' : 'border-gray-200'}`}>
                <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {toPublicImageUrl(image.url) ? <img src={toPublicImageUrl(image.url)} alt={image.alt} className="h-full w-full object-cover" /> : <span className="text-xs text-gray-400">No image</span>}
                </div>
                {index === 0 && <p className="text-xs font-semibold text-gray-900">Main image</p>}
                <input className={inputClass} aria-label={`Image URL ${index + 1}`} value={image.url} placeholder="https://…" onChange={(e) => setMedia(data.media.map((row, i) => i === index ? { ...row, url: e.target.value } : row))} />
                <input className={inputClass} aria-label={`Image description ${index + 1}`} value={image.alt} placeholder="Describe the photo" onChange={(e) => setMedia(data.media.map((row, i) => i === index ? { ...row, alt: e.target.value } : row))} />
                <select className={inputClass} aria-label={`Image variant ${index + 1}`} value={image.variant_id || ''} onChange={(e) => setMedia(data.media.map((row, i) => i === index ? { ...row, variant_id: e.target.value || null } : row))}>
                  <option value="">All variants</option>{savedVariants.map((v) => <option value={v.id} key={v.id}>{v.variant_name || v.sku}</option>)}
                </select>
                <div className="flex gap-2">
                  {index > 0 && <button type="button" className={smallButton} onClick={() => { const images = [...data.media]; [images[index - 1], images[index]] = [images[index], images[index - 1]]; setMedia(images); }}><ArrowUp className="h-3.5 w-3.5" aria-hidden /> Move up</button>}
                  <button type="button" className={smallButton} onClick={() => setMedia(data.media.filter((_, i) => i !== index))}><Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove</button>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-gray-500">No images yet.</p>}
      </Panel>

      <Panel title="Suppliers" description="Which supplier sells each variant to you, and their own code for it. Used when ordering stock.">
        <SearchPicker group="suppliers" placeholder="Add a supplier…" onPick={(supplier) => setSuppliers([...data.suppliers, { supplier_id: supplier.id, supplier_name: supplier.title, variant_id: savedVariants[0]?.id || '', supplier_sku: '', supplier_barcode: '', minimum_order_quantity: 1, preferred: 0 }])} />
        <div className="mt-3 space-y-2">
          {data.suppliers.map((row, index) => {
            const change = (patch) => setSuppliers(data.suppliers.map((r, i) => i === index ? { ...r, ...patch } : r));
            return (
              <div key={index} className="grid gap-2 rounded-xl bg-gray-50 p-3 md:grid-cols-[1fr_1fr_1fr_1fr_6rem_auto] md:items-end">
                <p className="text-sm font-semibold text-gray-900 md:self-center">{row.supplier_name}</p>
                <Field label="Our variant"><select className={inputClass} value={row.variant_id} onChange={(e) => change({ variant_id: e.target.value })}>{savedVariants.map((v) => <option key={v.id} value={v.id}>{v.variant_name || v.sku}</option>)}</select></Field>
                <Field label="Their code"><input className={inputClass} aria-label={`supplier_sku supplier ${index + 1}`} value={row.supplier_sku ?? ''} onChange={(e) => change({ supplier_sku: e.target.value })} /></Field>
                <Field label="Their barcode"><input className={inputClass} aria-label={`supplier_barcode supplier ${index + 1}`} value={row.supplier_barcode ?? ''} onChange={(e) => change({ supplier_barcode: e.target.value })} /></Field>
                <Field label="Min order"><input className={inputClass} aria-label={`minimum_order_quantity supplier ${index + 1}`} value={row.minimum_order_quantity ?? ''} onChange={(e) => change({ minimum_order_quantity: e.target.value })} /></Field>
                <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={!!Number(row.preferred)} onChange={(e) => change({ preferred: e.target.checked ? 1 : 0 })} /> Preferred</label>
              </div>
            );
          })}
          {!data.suppliers.length && <p className="text-sm text-gray-500">No suppliers linked.</p>}
        </div>
        {data.history.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold text-gray-900">What you paid before</p>
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 text-sm">
              {data.history.map((row, index) => (
                <li key={index} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span><span className="font-medium">{row.grn_number}</span> <span className="text-gray-500">· {String(row.receipt_date).slice(0, 10)} · {row.supplier_name} · {savedVariants.find((v) => v.id === Number(row.variant_id))?.sku || row.variant_id}</span></span>
                  <span className="tabular-nums">{row.quantity_received} × {formatCurrency(row.unit_cost)}{row.cost_change != null && <span className={`ml-2 text-xs ${Number(row.cost_change) > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{Number(row.cost_change) > 0 ? '+' : ''}{formatCurrency(row.cost_change)}</span>}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <div className="sticky bottom-0 z-20 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-lg">
        <Field label="Note for the change log" className="min-w-60 flex-1"><input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <button type="button" className={primaryButton} disabled={busy || !reason.trim()} onClick={save}>{busy ? 'Saving…' : 'Save online details'}</button>
      </div>
    </div>
  );
}
