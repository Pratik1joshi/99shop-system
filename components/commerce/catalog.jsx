'use client';
/**
 * Products — the one place to run the catalog: add a product, set its price,
 * photo, colours/sizes and barcodes, then print stickers. Rarely used tools
 * (bulk grid, CSV import, price lists) stay one click away, not in the way.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { BadgePercent, Barcode, Boxes, ChevronDown, Layers, Package, Plus, Printer, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import { useCommerceSearch } from './use-commerce-search';
import ProductBarcodes from './product-barcodes';
import ProductImport from './product-import';
import { ActionDrawer, Money } from '@/components/erp/primitives';
import { apiJson } from '@/lib/authed-fetch';
import { useCapabilities } from '@/lib/use-capabilities';
import { toPublicImageUrl } from '@/lib/public-image-url.js';
import { isShopBarcode, shopBarcode } from '@/lib/shop-barcode.js';
import { axesFrom, hasOptions, isStandard, optionKey, optionName, planOptions, splitValues } from '@/lib/product-options.js';
import { Badge, Field, ImageUploadButton, Notice, Page, PageHeader, Toggle, inputClass, primaryButton, secondaryButton, smallButton, textareaClass } from './catalog-ui';

// getRandomValues also works on plain-http LAN tills, where crypto.randomUUID is missing.
const newCode = shopBarcode;
const labelsHref = (ids) => `/admin/products/labels?ids=${ids.slice(0, 200).join(',')}`;
const isStandardOnly = (variants) => variants.length === 1 && (!variants[0].variant_name || variants[0].variant_name === 'Standard');

function ProductImage({ src, alt, size = 'h-12 w-12' }) {
  const url = toPublicImageUrl(src);
  const [failed, setFailed] = useState(null);
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 text-gray-300 ${size}`}>
      {url && failed !== url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt={alt} className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(url)} />
        : <Package className="h-1/2 w-1/2" aria-hidden />}
    </span>
  );
}

export default function Catalog() {
  const { can } = useCapabilities();
  const canEdit = can('catalog.manage');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [categoryId, setCategoryId] = useState('');
  const [stockStatus, setStockStatus] = useState('');
  const [active, setActive] = useState('true');
  const [refresh, setRefresh] = useState(0);
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState(() => new Map());
  const [product, setProduct] = useState(null);
  const [create, setCreate] = useState(null);
  const [importing, setImporting] = useState(false);
  const [lists, setLists] = useState({ attributes: [], brands: [] });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const search = useCommerceSearch(query, { group: 'catalog_products', limit: 40, page, active, categoryId, stockStatus, sort: 'name', refreshKey: refresh });
  const group = search.groups[0];
  const results = group?.results || [];

  useEffect(() => { apiJson('/api/admin/categories').then((d) => setCategories(d.categories || [])).catch(() => {}); }, [refresh]);
  // Saved colour/size lists and brands, offered as quick picks while editing.
  useEffect(() => { if (canEdit) apiJson('/api/admin/commerce/catalog-setup').then((d) => setLists({ attributes: d.attributes || [], brands: d.brands || [] })).catch(() => {}); }, [canEdit, refresh]);
  async function open(id, note = '', problem = '') {
    try { const data = await apiJson(`/api/admin/commerce/products?id=${id}`); setProduct({ ...data.product, loadedAt: Date.now(), problem }); setCreate(null); setError(''); setMessage(note); }
    catch (e) { setError(e.error || 'Could not open this product.'); }
  }
  // Links such as /admin/products?product=12 open that product directly.
  const openOnMount = useRef(open);
  useEffect(() => { const frame = requestAnimationFrame(() => { const params = new URLSearchParams(window.location.search); const id = params.get('product'); if (id) openOnMount.current(id); else if (params.get('import') === '1') setImporting(true); }); return () => cancelAnimationFrame(frame); }, []);

  const selectedProduct = (row) => row.variants.length > 0 && row.variants.every((variant) => selected.has(variant.id));
  const toggleVariant = (variant) => setSelected((current) => { const next = new Map(current); if (next.has(variant.id)) next.delete(variant.id); else next.set(variant.id, variant); return next; });
  const toggleProduct = (row) => setSelected((current) => { const next = new Map(current); const remove = row.variants.every((variant) => next.has(variant.id)); row.variants.forEach((variant) => (remove ? next.delete(variant.id) : next.set(variant.id, variant))); return next; });
  const allOnPage = results.length > 0 && results.every(selectedProduct);
  const selectPage = () => setSelected((current) => { const next = new Map(current); results.flatMap((row) => row.variants).forEach((variant) => (allOnPage ? next.delete(variant.id) : next.set(variant.id, variant))); return next; });

  return (
    <div>
      <PageHeader icon={Package} tone="bg-blue-50 text-blue-600" title="Products" description="Everything you sell. Click a product to change its price, photo, colours or sizes. Tick products to print price stickers."
        actions={<>
          <Link href="/admin/products/labels" className={secondaryButton}><Printer className="h-4 w-4" aria-hidden /> Print labels</Link>
          {canEdit && <button type="button" className={secondaryButton} onClick={() => { setImporting(true); setProduct(null); setCreate(null); }}><Upload className="h-4 w-4" aria-hidden /> Bulk upload</button>}
          {canEdit && <button type="button" className={primaryButton} onClick={() => { setCreate({ name: '', category_id: '', brand: '', description: '', price: '', mrp: '', barcode: newCode(), image_url: '', stock: '', cost: '', variants: [] }); setProduct(null); setError(''); }}><Plus className="h-4 w-4" aria-hidden /> Add product</button>}
        </>} />
      <datalist id="brand-options">{lists.brands.map((b) => <option key={b.id} value={b.name} />)}</datalist>
      <Page>
        <Notice onClose={() => setError('')}>{error}</Notice>
        <Notice tone="success" onClose={() => setMessage('')}>{!product && message}</Notice>
        <div className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_12rem_10rem_9rem]">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden /><input aria-label="Find product / SKU / barcode" placeholder="Search by name, brand, SKU or scan a barcode…" className={`${inputClass} pl-9`} value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} /></div>
          <select aria-label="Category" className={inputClass} value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select aria-label="Stock" className={inputClass} value={stockStatus} onChange={(e) => { setStockStatus(e.target.value); setPage(1); }}><option value="">Any stock</option><option value="in_stock">In stock</option><option value="low_stock">Low stock</option><option value="out_of_stock">Out of stock</option></select>
          <select aria-label="Status" className={inputClass} value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }}><option value="true">For sale</option><option value="all">Include hidden</option></select>
        </div>
        {search.error && <Notice>{`Could not load products: ${search.error}`}</Notice>}

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {results.length > 0 && (
            <label className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
              <input type="checkbox" className="h-4 w-4" checked={allOnPage} onChange={selectPage} aria-label="Select all on this page" /> Select all on this page
            </label>
          )}
          {search.loading && !results.length ? <p className="px-5 py-12 text-center text-sm text-gray-500">Loading products…</p>
            : !results.length ? <div className="px-5 py-12 text-center"><Package className="mx-auto mb-3 h-10 w-10 text-gray-300" aria-hidden /><p className="font-semibold text-gray-800">No products found</p><p className="text-sm text-gray-500">{query || categoryId || stockStatus ? 'Try clearing a filter.' : 'Add your first product to start selling.'}</p></div>
            : <ul className="divide-y divide-gray-100">{results.map((r) => {
              const stock = Number(r.available_stock || 0);
              return <li key={r.id} className={selectedProduct(r) ? 'bg-blue-50/60' : 'hover:bg-gray-50'}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <input type="checkbox" className="h-4 w-4 shrink-0" checked={selectedProduct(r)} onChange={() => toggleProduct(r)} aria-label={`Select all variants of ${r.title}`} />
                  <button type="button" onClick={() => open(r.product_id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <ProductImage src={r.image_url} alt={r.title} />
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-gray-900">{r.title}</span><span className="block truncate text-xs text-gray-500">{[r.category_name, r.brand, `${r.variant_count} option${r.variant_count === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span></span>
                    {!r.is_available && <Badge>Hidden</Badge>}
                    <span className={`hidden w-24 shrink-0 rounded-full px-2 py-1 text-center text-xs font-semibold sm:block ${stock <= 0 ? 'bg-red-50 text-red-700' : stock <= 5 ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{stock <= 0 ? 'Out of stock' : `${stock} in stock`}</span>
                    <span className="w-24 shrink-0 text-right text-sm font-bold tabular-nums text-gray-900"><Money value={r.price} />{r.price_max !== r.price && <span className="block text-xs font-normal text-gray-500">to <Money value={r.price_max} /></span>}</span>
                  </button>
                  <Link href={labelsHref(r.variants.map((variant) => variant.id))} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label={`Print labels for ${r.title}`} title="Print labels"><Printer className="h-4 w-4" aria-hidden /></Link>
                </div>
                {r.variant_count > 1 && <details className="border-t border-gray-100 bg-gray-50/70 px-4 py-2 sm:pl-12">
                  <summary className="cursor-pointer text-xs font-semibold text-blue-700">View {r.variant_count} colours, sizes and SKUs</summary>
                  <ul className="mt-2 divide-y divide-gray-200">{r.variants.map((variant) => <li key={variant.id} className="flex items-center gap-3 py-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 shrink-0" checked={selected.has(variant.id)} onChange={() => toggleVariant(variant)} aria-label={`Select ${r.title} ${variant.variant_name}`} />
                    <span className="min-w-0 flex-1"><span className="block font-medium text-gray-800">{variant.variant_name || 'Standard'}</span><span className="block truncate text-xs text-gray-500">{variant.sku || variant.barcode || 'No SKU or barcode'}</span></span>
                    <span className="text-xs text-gray-600">{Number(variant.available_stock) > 0 ? `${variant.available_stock} in stock` : 'Out of stock'}</span>
                    <span className="w-20 text-right font-medium tabular-nums"><Money value={variant.price} /></span>
                    <Link href={labelsHref([variant.id])} className="rounded-lg p-2 text-gray-500 hover:bg-gray-200" aria-label={`Print label for ${r.title} ${variant.variant_name}`}><Printer className="h-4 w-4" aria-hidden /></Link>
                  </li>)}</ul>
                </details>}
              </li>;
            })}</ul>}
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-gray-500">
            <span>Page {page}</span>
            <div className="flex gap-2"><button type="button" className={smallButton} disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><button type="button" className={smallButton} disabled={!group?.has_more} onClick={() => setPage(page + 1)}>Next</button></div>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gray-900 px-5 py-3 text-white shadow-xl">
            <span className="text-sm font-semibold">{selected.size} selected</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSelected(new Map())} className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-300 hover:bg-white/10">Clear</button>
              <Link href={labelsHref([...selected.keys()])} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100"><Printer className="h-4 w-4" aria-hidden /> Print labels</Link>
            </div>
          </div>
        )}
      </Page>

      <ActionDrawer extraWide open={!!create} onOpenChange={(value) => { if (!value) setCreate(null); }} title="Add product" description="Name, price and the stock you have now. Add variants for sizes or colours, each with its own price, barcode and stock.">
        {create && <NewProduct draft={create} setDraft={setCreate} categories={categories} onCategoryCreated={(category) => { setCategories((current) => [...current, category].sort((a, b) => a.name.localeCompare(b.name))); }} canAdjust={can('retail_inventory.adjust')} canCost={can('retail_inventory.view_cost')} onCancel={() => setCreate(null)} onCreated={async (id, problem) => { setRefresh((v) => v + 1); await open(id, 'Product added. Its barcode is ready — press “Print labels” below, or add colours and sizes.', problem); }} />}
      </ActionDrawer>

      <ProductImport open={importing} onOpenChange={setImporting} labelsHref={labelsHref} onImported={() => setRefresh((v) => v + 1)} />

      <ActionDrawer extraWide open={!!product} onOpenChange={(value) => { if (!value) { setProduct(null); setMessage(''); } }} title={product?.name || 'Product'} description="Change anything below, then press Save.">
        {product && <ProductEditor key={`${product.id}-${product.loadedAt}`} initial={product} categories={categories} attributes={lists.attributes} canEdit={canEdit} can={can} note={message} onSaved={async (note, problem) => { setRefresh((v) => v + 1); await open(product.id, note, problem); }} onDeleted={(note) => { setProduct(null); setSelected(new Map()); setMessage(note); setRefresh((v) => v + 1); }} />}
      </ActionDrawer>
    </div>
  );
}

function NewProduct({ draft, setDraft, categories, onCategoryCreated, onCreated, onCancel, canAdjust, canCost }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const ownCode = isShopBarcode(draft.barcode);
  const hasVariants = (draft.variants || []).length > 0;
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const variants = (draft.variants || []).filter((v) => v.variant_name.trim());
      const body = { ...draft, variants, stock: canAdjust ? draft.stock : '', cost: canAdjust && canCost ? draft.cost : '' };
      if (!canAdjust) body.variants = variants.map((v) => ({ ...v, stock: '', cost: '' }));
      const result = await apiJson('/api/admin/commerce/products', { method: 'POST', body: JSON.stringify(body) });
      await onCreated(result.id, '');
    }
    catch (e) { setError(e.error || 'Could not add the product.'); } finally { setBusy(false); }
  }
  async function saveCategory(event) {
    event.preventDefault();
    if (!categoryName.trim()) return;
    setCategoryBusy(true); setError('');
    try {
      const result = await apiJson('/api/admin/categories', { method: 'POST', body: JSON.stringify({ name: categoryName.trim() }) });
      onCategoryCreated(result.category);
      set({ category_id: String(result.category.id) });
      setCategoryName(''); setAddingCategory(false);
    } catch (e) { setError(e.error || 'Could not add category.'); }
    finally { setCategoryBusy(false); }
  }
  return (
    <form onSubmit={save} className="space-y-6 pb-4">
      <Notice onClose={() => setError('')}>{error}</Notice>
      <div className="grid gap-6 md:grid-cols-[12rem_1fr]">
        <div className="space-y-2">
          <ProductImage src={draft.image_url} alt="" size="h-48 w-48 md:h-44 md:w-full" />
          <div className="flex flex-wrap items-center gap-2">
            <ImageUploadButton label={draft.image_url ? 'Change photo' : 'Add photo'} onUploaded={(url) => set({ image_url: url })} />
            {draft.image_url && <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => set({ image_url: '' })}>Remove</button>}
          </div>
          <p className="text-xs text-gray-500">Optional. Shown in Billing and the online store.</p>
        </div>
        <div className="grid content-start gap-4 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2"><input autoFocus required className={`${inputClass} h-11 text-base`} value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Bunny hair clip" /></Field>
          <div className="space-y-2"><Field label="Category"><select className={inputClass} value={draft.category_id} onChange={(e) => set({ category_id: e.target.value })}><option value="">No category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><button type="button" className="text-sm font-semibold text-blue-700 hover:underline" onClick={() => setAddingCategory((value) => !value)}>+ New category</button>{addingCategory && <div className="flex flex-wrap gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3"><input aria-label="New category name" className={`${inputClass} min-w-36 flex-1`} value={categoryName} onChange={(e) => setCategoryName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveCategory(e); } }} placeholder="Category name" /><button type="button" className={secondaryButton} disabled={categoryBusy || !categoryName.trim()} onClick={saveCategory}>{categoryBusy ? 'Adding…' : 'Add category'}</button></div>}</div>
          <Field label="Brand (optional)"><input list="brand-options" className={inputClass} value={draft.brand} onChange={(e) => set({ brand: e.target.value })} placeholder="e.g. Kawaii" /></Field>
          {!hasVariants && <>
            <Field label="Selling price (Rs)"><input required type="number" min="0" step="0.01" className={inputClass} value={draft.price} onChange={(e) => set({ price: e.target.value })} /></Field>
            <Field label="MRP (optional)" hint="Printed on the label when higher than the price."><input type="number" min="0" step="0.01" className={inputClass} value={draft.mrp} onChange={(e) => set({ mrp: e.target.value })} /></Field>
            {canAdjust && <Field label="Opening stock (optional)" hint="How many you have on the shelf right now."><input type="number" min="0" step="1" className={inputClass} value={draft.stock} onChange={(e) => set({ stock: e.target.value })} placeholder="0" /></Field>}
            {canAdjust && canCost && Number(draft.stock) > 0 && <Field label="Cost each (optional)" hint="What one piece cost you, for profit reports."><input type="number" min="0" step="0.01" className={inputClass} value={draft.cost} onChange={(e) => set({ cost: e.target.value })} /></Field>}
          </>}
          <Field label="Description (optional)" hint="Shown on the product page in the online store." className="sm:col-span-2"><textarea rows={5} className={textareaClass} value={draft.description} onChange={(e) => set({ description: e.target.value })} placeholder="What should customers know about this product?" /></Field>
          {!hasVariants && <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 sm:col-span-2">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Barcode" className="min-w-0 flex-1">
                {/* Selecting on focus lets a scanner replace the created code instead of appending to it; Enter from the scanner must not submit. */}
                <input aria-label="Barcode" className={`${inputClass} font-mono`} value={draft.barcode} onFocus={(e) => e.target.select()} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} onChange={(e) => set({ barcode: e.target.value.trim() })} placeholder="Scan or type" />
              </Field>
              <button type="button" className={secondaryButton} onClick={() => set({ barcode: newCode() })}><RefreshCw className="h-4 w-4" aria-hidden /> New code</button>
            </div>
            <p className="mt-2 flex items-start gap-2 text-xs text-gray-600"><Barcode className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{ownCode ? 'Created for you and ready to print on stickers. If the item already has a barcode on its pack, click the box and scan it.' : draft.barcode ? 'Using the barcode from the pack.' : 'Empty: a code will be created when you add the product.'}</p>
          </div>}
        </div>
      </div>
      <NewVariants rows={draft.variants || []} onChange={(variants) => set({ variants })} canAdjust={canAdjust} canCost={canCost} defaultPrice={draft.price} />
      <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
        <button type="button" className={secondaryButton} onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={busy} className={`${primaryButton} min-w-40`}>{busy ? 'Adding…' : 'Add product'}</button>
      </div>
    </form>
  );
}

const blankVariant = (price = '') => ({ key: Math.random().toString(36).slice(2), variant_name: '', price, mrp: '', barcode: newCode(), stock: '', cost: '' });

/**
 * Sizes or colours entered with the product: each row is its own SKU with a
 * price, barcode and the stock on the shelf now.
 */
function NewVariants({ rows, onChange, canAdjust, canCost, defaultPrice }) {
  const update = (key, patch) => onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const remove = (key) => onChange(rows.filter((row) => row.key !== key));
  const add = () => onChange([...rows, blankVariant(rows.at(-1)?.price ?? defaultPrice)]);
  const totalStock = rows.reduce((sum, row) => sum + (Number(row.stock) || 0), 0);
  if (!rows.length) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 px-4 py-3">
        <p className="text-sm text-gray-600">Comes in sizes or colours? Add each one with its own price, barcode and stock.</p>
        <button type="button" className={secondaryButton} onClick={() => onChange([blankVariant(defaultPrice), blankVariant(defaultPrice)])}><Layers className="h-4 w-4" aria-hidden /> Add variants</button>
      </div>
    );
  }
  return (
    <section className="space-y-3 rounded-xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Variants</h3>
          <p className="text-xs text-gray-500">{rows.length} variant{rows.length === 1 ? '' : 's'}{canAdjust ? ` · ${totalStock} in stock` : ''}. Rows without a name are skipped.</p>
        </div>
        <button type="button" className="text-sm font-semibold text-gray-600 hover:underline" onClick={() => onChange([])}>Use one price instead</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr>
              <th className="pb-2 pr-2 font-medium">Size / colour</th>
              <th className="pb-2 pr-2 font-medium">Price (Rs)</th>
              <th className="pb-2 pr-2 font-medium">MRP</th>
              <th className="pb-2 pr-2 font-medium">Barcode</th>
              {canAdjust && <th className="pb-2 pr-2 font-medium">Opening stock</th>}
              {canAdjust && canCost && <th className="pb-2 pr-2 font-medium">Cost each</th>}
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.key} className="align-top">
                <td className="py-1 pr-2"><input aria-label={`Variant ${index + 1} name`} className={inputClass} value={row.variant_name} onChange={(e) => update(row.key, { variant_name: e.target.value })} placeholder={index === 0 ? 'e.g. Pink' : 'e.g. Blue'} /></td>
                <td className="py-1 pr-2"><input aria-label={`Variant ${index + 1} price`} required={!!row.variant_name.trim()} type="number" min="0" step="0.01" className={`${inputClass} w-28`} value={row.price} onChange={(e) => update(row.key, { price: e.target.value })} /></td>
                <td className="py-1 pr-2"><input aria-label={`Variant ${index + 1} MRP`} type="number" min="0" step="0.01" className={`${inputClass} w-24`} value={row.mrp} onChange={(e) => update(row.key, { mrp: e.target.value })} /></td>
                <td className="py-1 pr-2"><input aria-label={`Variant ${index + 1} barcode`} className={`${inputClass} w-44 font-mono text-xs`} value={row.barcode} onFocus={(e) => e.target.select()} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} onChange={(e) => update(row.key, { barcode: e.target.value.trim() })} placeholder="Scan or leave for a new code" /></td>
                {canAdjust && <td className="py-1 pr-2"><input aria-label={`Variant ${index + 1} opening stock`} type="number" min="0" step="1" inputMode="numeric" className={`${inputClass} w-24 text-right tabular-nums`} value={row.stock} onChange={(e) => update(row.key, { stock: e.target.value })} placeholder="0" /></td>}
                {canAdjust && canCost && <td className="py-1 pr-2"><input aria-label={`Variant ${index + 1} cost each`} type="number" min="0" step="0.01" disabled={!(Number(row.stock) > 0)} className={`${inputClass} w-24 text-right`} value={row.cost} onChange={(e) => update(row.key, { cost: e.target.value })} /></td>}
                <td className="py-1"><button type="button" aria-label={`Remove variant ${index + 1}`} onClick={() => remove(row.key)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-4 w-4" aria-hidden /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className={smallButton} onClick={add}><Plus className="h-3.5 w-3.5" aria-hidden /> Add another</button>
    </section>
  );
}

function ProductEditor({ initial, categories, attributes, canEdit, can, note, onSaved, onDeleted }) {
  const [p, setP] = useState(initial);
  const [removed, setRemoved] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initial.problem || '');
  const [message, setMessage] = useState(note);
  const [builder, setBuilder] = useState(null);
  const canAdjust = canEdit && can('retail_inventory.adjust');
  const canCost = can('retail_inventory.view_cost');
  const [more, setMore] = useState(false);
  const [confirmTracking, setConfirmTracking] = useState(false);
  const [history, setHistory] = useState(null);
  const set = (patch) => setP((cur) => ({ ...cur, ...patch }));
  const setVariant = (index, patch) => setP((cur) => ({ ...cur, variants: cur.variants.map((v, i) => i === index ? { ...v, ...patch } : v) }));
  const single = isStandardOnly(p.variants);
  const savedIds = p.variants.filter((v) => v.id).map((v) => v.id);
  const trackingChanged = p.variants.some((v) => v.id && initial.variants.find((o) => o.id === v.id)?.tracking_mode !== v.tracking_mode);
  const stockTotal = p.variants.reduce((sum, v) => sum + Number(v.available_stock || 0), 0);

  async function save() {
    setBusy(true); setError(''); setMessage('');
    try {
      // A version can only be removed once its stock is 0, so a removed one that
      // still holds stock (usually the old “Standard”) is counted down first. The
      // cost that stock carried goes onto whatever is counted onto the others.
      let carriedCost = null;
      for (const v of removed.filter((row) => row.id && Number(row.available_stock) > 0)) {
        const out = await apiJson('/api/admin/retail-inventory-adjustments', { method: 'POST', body: JSON.stringify({
          type: 'MANUAL', variant_id: v.id, quantity: -Number(v.available_stock), reason: 'COUNT_VARIANCE',
          notes: 'Stock moved off a removed version', idempotency_key: `product-remove-${v.id}-${Date.now()}`,
        }) });
        carriedCost ??= out.retail_inventory_adjustment?.unit_cost ?? null;
      }
      const result = await apiJson('/api/admin/commerce/products', { method: 'PUT', body: JSON.stringify({ ...p, remove_variant_ids: removed.map((v) => v.id), confirm_tracking: trackingChanged && confirmTracking }) });
      const kept = result.removed?.archived || 0;
      // Stock goes in after the product, so brand-new versions have ids by then.
      const edits = stockEdits(p.variants);
      const problems = edits.length ? await applyStockCounts(edits, (await apiJson(`/api/admin/commerce/products?id=${p.id}`)).product.variants, carriedCost) : [];
      await onSaved(kept ? `Saved. ${kept} removed version${kept === 1 ? ' has' : 's have'} past sales or stock, so ${kept === 1 ? 'it was' : 'they were'} hidden instead of deleted.` : 'Saved.',
        problems.length ? `Saved, but stock was not changed for ${problems.join('; ')}` : '');
    } catch (e) { setError(e.error || 'Could not save. Your changes are still here.'); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try {
      const result = await apiJson(`/api/admin/commerce/products?id=${p.id}`, { method: 'DELETE' });
      onDeleted(result.result === 'deleted' ? `“${p.name}” was deleted.` : `“${p.name}” has past sales or stock, so it was taken off sale instead of deleted. Find it under “Include hidden”.`);
    } catch (e) { setError(e.error || 'Could not delete this product.'); setBusy(false); }
  }
  // Saved versions are removed on Save; unsaved ones just drop out of the list.
  function removeVersion(index) {
    const version = p.variants[index];
    if (version.id) setRemoved((list) => [...list, version]);
    set({ variants: p.variants.filter((_, i) => i !== index) });
  }
  const unnamedType = builder?.axes.some((axis) => axis.values.trim() && !axis.name.trim());
  const filledTypeNames = builder?.axes.filter((axis) => axis.values.trim()).map((axis) => axis.name.trim().toLowerCase()) || [];
  const duplicateType = new Set(filledTypeNames).size !== filledTypeNames.length;
  const plan = builder && !unnamedType && !duplicateType ? planOptions(builder.axes, p.variants) : null;
  const planChanges = plan ? plan.add.length + plan.remove.length + plan.renamed : 0;
  const setAxis = (index, patch) => setBuilder((b) => ({ axes: b.axes.map((a, i) => i === index ? { ...a, ...patch } : a) }));
  const optioned = p.variants.some(hasOptions);
  const leftoverStandard = optioned ? p.variants.findIndex(isStandard) : -1;
  const oldCodes = p.variants.filter((v) => String(v.barcode || '').startsWith('INT-')).length;
  function applyOptions() {
    const { targets, keep, remove } = plan;
    const first = p.variants.find((v) => !isStandard(v)) || p.variants[0] || {};
    const byOption = new Map([...keep].map(([index, target]) => [optionKey(target), index]));
    // Versions follow the typed order; anything without options stays at the end.
    const rows = targets.map((target) => {
      const index = byOption.get(optionKey(target));
      if (index == null) return { variant_name: optionName(target), price: first.price ?? 0, mrp: first.mrp ?? '', sku: '', barcode: '', tracking_mode: 'none', attributes: target };
      const v = p.variants[index];
      return optionKey(v.attributes) === optionKey(target) ? v : { ...v, attributes: target, variant_name: optionName(target) };
    });
    const others = p.variants.filter((_, i) => !keep.has(i) && !remove.includes(i));
    setRemoved((list) => [...list, ...remove.map((i) => p.variants[i]).filter((v) => v.id)]);
    set({ variants: [...rows, ...others] });
    setBuilder(null);
  }

  return (
    <div className="space-y-5 pb-4">
      <Notice onClose={() => setError('')}>{error}</Notice>
      {message && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{message}</span>{savedIds.length > 0 && <Link href={labelsHref(savedIds)} className={smallButton}><Printer className="h-3.5 w-3.5" aria-hidden /> Print labels</Link>}</div>}

      <section className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="space-y-2">
          <ProductImage src={p.image_url} alt={p.name} size="h-28 w-28" />
          {canEdit && <div className="flex flex-col gap-1"><ImageUploadButton label={p.image_url ? 'Change photo' : 'Add photo'} onUploaded={(url) => set({ image_url: url })} />{p.image_url && <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => set({ image_url: '' })}>Remove photo</button>}</div>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2"><input className={inputClass} value={p.name || ''} disabled={!canEdit} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Category"><select className={inputClass} disabled={!canEdit} value={p.category_id || ''} onChange={(e) => set({ category_id: e.target.value })}><option value="">No category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Brand"><input list="brand-options" className={inputClass} value={p.brand || ''} disabled={!canEdit} onChange={(e) => set({ brand: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Toggle checked={!!Number(p.is_available)} onChange={(v) => set({ is_available: v })} label="For sale" description="Off hides it from Billing and the online store. Stock and history stay." /></div>
          <div className="sm:col-span-2"><Toggle checked={!!Number(p.online_enabled)} onChange={(v) => set({ online_enabled: v })} label="Sell online" description="Customers can add it to their bag on the website. Off shows it there with “Ask about this item”." /></div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="font-semibold text-gray-900">{single ? 'Variants, price & stock' : 'Variants, prices & stock'}</h3><p className="text-xs text-gray-500">{single ? 'Add sizes or colours here if this product has more than one version.' : `${p.variants.length} variants. Each has its own price, barcode and stock.`}</p></div>
          <span className="inline-flex items-center gap-2 text-sm text-gray-600"><Boxes className="h-4 w-4" aria-hidden />{stockTotal} in stock<Link className="font-semibold text-blue-700 hover:underline" href={`/admin/retail-inventory?q=${encodeURIComponent(p.name || '')}`}>Add stock</Link></span>
        </div>
        {canEdit && leftoverStandard >= 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            <span>“Standard” is left over from before this product had sizes or colours. Shoppers see it as an extra option.</span>
            <button type="button" className={smallButton} onClick={() => removeVersion(leftoverStandard)}><Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove Standard</button>
          </div>
        )}
        {canEdit && oldCodes > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <span>{oldCodes === 1 ? 'Its barcode is an old INT- code.' : `${oldCodes} barcodes are old INT- codes.`} Number barcodes are easier to read and type. Stickers already printed with the old code stop scanning.</span>
            <button type="button" className={smallButton} onClick={() => set({ variants: p.variants.map((v) => String(v.barcode || '').startsWith('INT-') ? { ...v, barcode: shopBarcode() } : v) })}><Barcode className="h-3.5 w-3.5" aria-hidden /> Switch to numbers</button>
          </div>
        )}
        {single ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Selling price (Rs)"><input type="number" min="0" step="0.01" className={inputClass} disabled={!canEdit} value={p.variants[0].price ?? ''} onChange={(e) => setVariant(0, { price: e.target.value })} /></Field>
            <Field label="MRP (optional)"><input type="number" min="0" step="0.01" className={inputClass} disabled={!canEdit} value={p.variants[0].mrp ?? ''} onChange={(e) => setVariant(0, { mrp: e.target.value })} /></Field>
            <BarcodeField variant={p.variants[0]} disabled={!canEdit} onChange={(barcode) => setVariant(0, { barcode })} />
            <Field label="SKU (optional)"><input className={inputClass} disabled={!canEdit} value={p.variants[0].sku ?? ''} onChange={(e) => setVariant(0, { sku: e.target.value })} /></Field>
            {canAdjust && <Field label="Stock" hint="Type the count on the shelf, then Save."><StockInput variant={p.variants[0]} canCost={canCost} onChange={(patch) => setVariant(0, patch)} label="Stock" /></Field>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-500"><tr><th className="py-2 pr-2">Version</th><th className="px-2">Price</th><th className="px-2">MRP</th><th className="px-2">Barcode</th><th className="px-2">SKU</th><th className="px-2 text-right">Stock</th><th /></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {p.variants.map((v, index) => (
                  <tr key={v.id || `new-${index}`}>
                    <td className="py-2 pr-2"><input aria-label={`Version name ${index + 1}`} className={`${inputClass} min-w-28`} disabled={!canEdit} value={v.variant_name ?? ''} onChange={(e) => setVariant(index, { variant_name: e.target.value })} />{!v.id && <span className="mt-1 inline-block"><Badge tone="blue">New</Badge></span>}</td>
                    <td className="px-2"><input aria-label={`Price ${index + 1}`} type="number" min="0" step="0.01" className={`${inputClass} w-24`} disabled={!canEdit} value={v.price ?? ''} onChange={(e) => setVariant(index, { price: e.target.value })} /></td>
                    <td className="px-2"><input aria-label={`MRP ${index + 1}`} type="number" min="0" step="0.01" className={`${inputClass} w-24`} disabled={!canEdit} value={v.mrp ?? ''} onChange={(e) => setVariant(index, { mrp: e.target.value })} /></td>
                    <td className="px-2"><BarcodeField compact variant={v} disabled={!canEdit} onChange={(barcode) => setVariant(index, { barcode })} label={`Barcode ${index + 1}`} /></td>
                    <td className="px-2"><input aria-label={`SKU ${index + 1}`} className={`${inputClass} w-28`} disabled={!canEdit} value={v.sku ?? ''} onChange={(e) => setVariant(index, { sku: e.target.value })} /></td>
                    <td className="px-2 text-right tabular-nums text-gray-700">{canAdjust ? <StockInput compact variant={v} canCost={canCost} onChange={(patch) => setVariant(index, patch)} label={`Stock ${v.variant_name || index + 1}`} /> : v.id ? Number(v.available_stock || 0) : '—'}</td>
                    <td className="pl-2">{canEdit && p.variants.length > 1 && <button type="button" aria-label={`Remove version ${v.variant_name || index + 1}`} title="Remove this version" onClick={() => removeVersion(index)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"><Trash2 className="h-4 w-4" aria-hidden /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {removed.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span>Removed when you press Save: {removed.map((v) => `${v.variant_name || 'Standard'}${Number(v.available_stock) > 0 ? ` (${v.available_stock} in stock)` : ''}`).join(', ')}.
              {removed.some((v) => Number(v.available_stock) > 0) && <strong className="block">Type how many of each version you really have in the Stock boxes above. Stock you don&apos;t count is written off.</strong>}</span>
            <button type="button" className={smallButton} onClick={() => { set({ variants: [...removed, ...p.variants] }); setRemoved([]); }}>Undo</button>
          </div>
        )}
        {canEdit && (builder ? (
          <div className="mt-4 space-y-4 rounded-xl bg-gray-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-sm font-semibold text-gray-900">{optioned ? 'Edit sizes, colours & other options' : 'Add sizes, colours & other options'}</p><p className="text-xs text-gray-500">Add or remove values, or a whole type. Versions update to match.</p></div>
              <Link href="/admin/products/setup?tab=attributes" className="text-xs font-semibold text-blue-700 hover:underline">Edit saved lists</Link>
            </div>
            <datalist id="attribute-names">{attributes.map((a) => <option key={a.id} value={a.name} />)}</datalist>
            {builder.axes.map((axis, index) => {
              const saved = attributes.find((a) => a.name.toLowerCase() === axis.name.trim().toLowerCase())?.values || [];
              const chosen = splitValues(axis.values);
              return (
                <div key={index} className="space-y-2">
                  <div className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
                    <Field label="Type name"><input list="attribute-names" aria-label={`Type ${index + 1}`} className={inputClass} value={axis.name} onChange={(e) => setAxis(index, { name: e.target.value })} placeholder="Colour, Size, Material…" /></Field>
                    <Field label={`${axis.name.trim() || 'Values'} — separated by commas`}><input autoFocus={index === 0} aria-label={`Values ${index + 1}`} className={inputClass} value={axis.values} onChange={(e) => setAxis(index, { values: e.target.value })} placeholder={index === 0 ? 'Pink, Black, Gold' : 'S, M, L'} /></Field>
                    <button type="button" aria-label={`Remove type ${index + 1}`} disabled={builder.axes.length === 1} className="rounded-lg border border-gray-200 p-2.5 text-gray-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-40" onClick={() => setBuilder((current) => ({ axes: current.axes.filter((_, i) => i !== index) }))}><Trash2 className="h-4 w-4" aria-hidden /></button>
                  </div>
                  {saved.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 sm:pl-[10.75rem]">
                      <span className="text-xs text-gray-500">Saved:</span>
                      {saved.map((v) => {
                        const on = chosen.some((c) => c.toLowerCase() === v.value.toLowerCase());
                        return (
                          <button key={v.id} type="button" aria-pressed={on} onClick={() => setAxis(index, { values: (on ? chosen.filter((c) => c.toLowerCase() !== v.value.toLowerCase()) : [...chosen, v.value]).join(', ') })}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`}>
                            {v.swatch && <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: v.swatch }} aria-hidden />}{v.value}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            <button type="button" className={secondaryButton} onClick={() => setBuilder((current) => ({ axes: [...current.axes, { name: '', values: '' }] }))}><Plus className="h-4 w-4" aria-hidden /> New type</button>
            <div className="space-y-1 text-xs text-gray-600">
              {unnamedType ? <p>Name each type first.</p> : duplicateType ? <p>Use a different name for each type.</p> : !plan?.targets.length ? <p>Enter at least one value.</p> : !planChanges ? <p>No changes yet.</p> : <>
                {plan.add.length > 0 && <p className="text-emerald-700">Adds {plan.add.length}: {plan.add.slice(0, 8).map(optionName).join(', ')}{plan.add.length > 8 ? '…' : ''}</p>}
                {plan.remove.length > 0 && <p className="text-red-700">Removes {plan.remove.length}: {plan.remove.slice(0, 8).map((i) => p.variants[i].variant_name || 'Standard').join(', ')}{plan.remove.length > 8 ? '…' : ''}</p>}
                {plan.renamed > 0 && <p>Renames {plan.renamed} to match the new options.</p>}
                <p className="text-gray-500">Nothing is saved until you press Save. A version that was already sold can&apos;t change its size or colour; remove it and keep the new one instead.</p>
              </>}
            </div>
            <div className="flex gap-2"><button type="button" className={primaryButton} disabled={!planChanges || plan.targets.length + p.variants.length > 400} onClick={applyOptions}><Layers className="h-4 w-4" aria-hidden /> Apply</button><button type="button" className={secondaryButton} onClick={() => setBuilder(null)}>Cancel</button></div>
          </div>
        ) : (
          <button type="button" className={`${secondaryButton} mt-4`} onClick={() => setBuilder({ axes: optioned ? axesFrom(p.variants) : [{ name: 'Colour', values: '' }] })}><Layers className="h-4 w-4" aria-hidden /> {optioned ? 'Edit sizes & colours' : 'Add variants (size, colour…)'}</button>
        ))}
      </section>

      {canEdit && <SpecialPrices product={p} single={single} setVariant={setVariant} />}

      <section className="rounded-2xl border border-gray-200">
        <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className="flex w-full items-center justify-between px-4 py-3 text-left">
          <span><span className="block font-semibold text-gray-900">More details</span><span className="text-xs text-gray-500">Description, reorder level, tracking, extra barcodes, history</span></span>
          <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${more ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {more && (
          <div className="space-y-4 border-t border-gray-100 p-4">
            <Field label="Description"><textarea rows={3} className={textareaClass} disabled={!canEdit} value={p.description || ''} onChange={(e) => set({ description: e.target.value })} /></Field>
            <div className="space-y-3">
              {p.variants.map((v, index) => (
                <div key={v.id || `adv-${index}`} className="grid gap-3 rounded-xl bg-gray-50 p-3 sm:grid-cols-4">
                  <p className="text-sm font-semibold text-gray-900 sm:col-span-4">{v.variant_name || 'Standard'}</p>
                  <Field label="Reorder when stock ≤"><input type="number" min="0" className={inputClass} disabled={!canEdit} value={v.reorder_point ?? ''} onChange={(e) => setVariant(index, { reorder_point: e.target.value })} /></Field>
                  <Field label="Reorder quantity"><input type="number" min="0" className={inputClass} disabled={!canEdit} value={v.reorder_quantity ?? ''} onChange={(e) => setVariant(index, { reorder_quantity: e.target.value })} /></Field>
                  <Field label="Tracking"><select className={inputClass} disabled={!canEdit} value={v.tracking_mode || 'none'} onChange={(e) => setVariant(index, { tracking_mode: e.target.value })}><option value="none">Quantity only</option><option value="batch">Batch / expiry date</option><option value="serial">Serial numbers</option></select></Field>
                  <Field label="Tax category"><input className={inputClass} disabled={!canEdit} value={v.tax_category ?? ''} onChange={(e) => setVariant(index, { tax_category: e.target.value })} /></Field>
                </div>
              ))}
              {trackingChanged && <label className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" checked={confirmTracking} onChange={(e) => setConfirmTracking(e.target.checked)} /> I understand tracking can only change before any stock is recorded.</label>}
            </div>
            <div><p className="mb-2 text-sm font-semibold text-gray-900">Extra barcodes</p><div className="commerce-form"><ProductBarcodes product={p} canManage={canEdit} onRefresh={() => onSaved('Barcode list updated.')} /></div></div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={smallButton} onClick={async () => { try { setHistory(await apiJson(`/api/admin/commerce/products/history?id=${p.id}`)); } catch (e) { setError(e.error || 'History unavailable.'); } }}>Show recent stock and sales</button>
              <Link className={smallButton} href={`/admin/products/merchandising?product=${p.id}&name=${encodeURIComponent(p.name || '')}`}>Edit many versions in a grid</Link>
            </div>
            {history && (
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 text-sm">
                {[...history.sales.map((s) => ({ key: `s${s.id}`, text: `Sold ${s.quantity} · ${s.sale_number}`, at: s.completed_at })), ...history.movements.map((m) => ({ key: `m${m.id}`, text: `${m.movement_type.replaceAll('_', ' ').toLowerCase()} ${m.quantity}`, at: m.created_at }))].slice(0, 20).map((row) => <li key={row.key} className="flex justify-between gap-3 px-3 py-2"><span className="capitalize">{row.text}</span><span className="text-xs text-gray-500">{String(row.at || '').slice(0, 16)}</span></li>)}
                {!history.sales.length && !history.movements.length && <li className="px-3 py-3 text-gray-500">No stock or sales yet.</li>}
              </ul>
            )}
          </div>
        )}
      </section>

      {canEdit && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-white pt-3">
          <button type="button" onClick={() => { setError(''); setConfirmDelete(true); }} className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" aria-hidden /> Delete product</button>
          {savedIds.length > 0 && <Link href={labelsHref(savedIds)} className={secondaryButton}><Printer className="h-4 w-4" aria-hidden /> Print labels</Link>}
          <button type="button" className={primaryButton} disabled={busy || !p.name?.trim() || (trackingChanged && !confirmTracking)} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      )}
      {!can('catalog.manage') && <p className="text-xs text-gray-500">You can view products. Ask an admin for permission to change them.</p>}

      <Dialog.Root open={confirmDelete} onOpenChange={(value) => { if (!busy) setConfirmDelete(value); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[130] bg-gray-950/50 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[131] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl focus:outline-none">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-red-100 text-red-600"><Trash2 className="h-5 w-5" aria-hidden /></span>
              <div className="min-w-0">
                <Dialog.Title className="text-lg font-bold text-gray-900">Delete this product?</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-gray-600">It will be removed from Billing, the online store and the product list.</Dialog.Description>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <ProductImage src={p.image_url} alt="" size="h-12 w-12" />
              <span className="min-w-0"><span className="block truncate font-semibold text-gray-900">{p.name}</span><span className="block text-xs text-gray-500">{p.variants.length} version{p.variants.length === 1 ? '' : 's'} · {stockTotal} in stock</span></span>
            </div>
            <p className="mt-3 text-xs text-gray-500">Already sold or stocked before? Then it is hidden instead of deleted, so your sales reports stay correct.</p>
            {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-800">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild><button type="button" className={secondaryButton} disabled={busy}>Keep it</button></Dialog.Close>
              <button type="button" disabled={busy} onClick={remove} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"><Trash2 className="h-4 w-4" aria-hidden />{busy ? 'Deleting…' : 'Delete product'}</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

const shortDate = (value) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const localToday = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const dayStart = (date) => new Date(`${date}T00:00`);
function ruleStatus(rule, now) {
  if (!Number(rule.active) || (rule.ends_at && new Date(rule.ends_at).getTime() <= now)) return { label: 'Ended', tone: 'gray', live: false };
  if (rule.starts_at && new Date(rule.starts_at).getTime() > now) return { label: `Starts ${shortDate(rule.starts_at)}`, tone: 'blue', live: true };
  return { label: 'On now', tone: 'green', live: true };
}
// Stored end is the midnight after the last day, so show the day before it.
const ruleDates = (r) => (r.starts_at || r.ends_at ? `${r.starts_at ? shortDate(r.starts_at) : 'from now'} – ${r.ends_at ? shortDate(new Date(r.ends_at).getTime() - 1) : 'no end date'}` : null);

/**
 * Sale and buy-more prices for this one product, stored as a one-product price list,
 * so Billing and the online store pick them up through the normal price engine.
 */
function SpecialPrices({ product, single, setVariant }) {
  const [rules, setRules] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now] = useState(() => Date.now());
  const load = useCallback(() => apiJson(`/api/admin/commerce/pricing?product_id=${product.id}`).then((d) => setRules(d.rules || [])).catch((e) => setError(e.error || 'Could not load special prices.')), [product.id]);
  useEffect(() => { load(); }, [load]);
  const ours = (rule) => String(rule.code || '').startsWith(`SALE-P${product.id}-`);

  async function saveList(body) {
    setBusy(true); setError('');
    try { await apiJson('/api/admin/commerce/pricing', { method: 'POST', body: JSON.stringify({ action: 'price_list', channel: null, customer_group_id: null, priority: 0, ...body }) }); setDraft(null); await load(); }
    catch (e) { setError(e.error || 'Could not save the special price.'); } finally { setBusy(false); }
  }
  function start() {
    const value = Number(draft.value);
    const quantity = Number(draft.min_quantity || 1);
    if (!(value > 0) || (draft.mode === 'percent' && value >= 100)) return setError(draft.mode === 'percent' ? 'Enter a discount between 1 and 99%.' : 'Enter the sale price.');
    if (!(quantity >= 1)) return setError('“Buy at least” must be 1 or more.');
    if (draft.to && draft.from && draft.to < draft.from) return setError('The end date is before the start date.');
    const end = draft.to ? dayStart(draft.to) : null;
    if (end) end.setDate(end.getDate() + 1);
    saveList({
      name: `${quantity > 1 ? `Buy ${quantity}+` : 'Sale'} · ${product.name}`.slice(0, 160),
      code: `SALE-P${product.id}-${Date.now().toString(36).toUpperCase()}`,
      active: true,
      starts_at: draft.from ? dayStart(draft.from).toISOString() : null,
      ends_at: end ? end.toISOString() : null,
      items: [{ ...(draft.variant_id ? { variant_id: Number(draft.variant_id) } : { product_id: product.id }), min_quantity: quantity, ...(draft.mode === 'percent' ? { adjustment_percent: -value } : { fixed_price: value }) }],
      reason: `Special price set on product ${product.name}`,
    });
  }
  const stop = (r) => saveList({ id: r.list_id, name: r.list_name, code: r.code, active: false, channel: r.channel, customer_group_id: r.customer_group_id, priority: r.priority, starts_at: r.starts_at, ends_at: r.ends_at, items: [{ product_id: r.product_id, variant_id: r.variant_id, min_quantity: r.min_quantity, fixed_price: r.fixed_price, adjustment_percent: r.adjustment_percent }], reason: `Special price stopped on product ${product.name}` });

  return (
    <section className="space-y-4 rounded-2xl border border-gray-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="flex items-center gap-2 font-semibold text-gray-900"><BadgePercent className="h-4 w-4 text-rose-600" aria-hidden /> Special prices</h3><p className="text-xs text-gray-500">Optional. The normal price is above. Use these for a sale, a buy-more price or wholesale customers.</p></div>
        <Link href="/admin/products/pricing" className="text-xs font-semibold text-blue-700 hover:underline">All special prices</Link>
      </div>
      <Notice onClose={() => setError('')}>{error}</Notice>

      <div className="rounded-xl bg-gray-50 p-3">
        <p className="text-sm font-semibold text-gray-900">Wholesale price</p>
        <p className="text-xs text-gray-500">Charged automatically to customers in a wholesale group. Saved with the Save button.</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {product.variants.map((v, index) => (
            <Field key={v.id || `w-${index}`} label={single ? 'Wholesale price (Rs)' : (v.variant_name || 'Standard')}>
              <input aria-label={`Wholesale price ${v.variant_name || 'Standard'}`} type="number" min="0" step="0.01" className={inputClass} value={v.wholesale_price ?? ''} onChange={(e) => setVariant(index, { wholesale_price: e.target.value })} placeholder="Same as price" />
            </Field>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-900">Sales and buy-more prices</p>
        {rules === null ? <p className="text-sm text-gray-500">Loading…</p> : rules.length === 0 ? <p className="text-sm text-gray-500">None yet.</p> : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
            {rules.map((r) => {
              const s = ruleStatus(r, now);
              const percent = Number(r.adjustment_percent);
              return (
                <li key={r.id} className={`flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm ${s.live ? '' : 'opacity-60'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">{r.fixed_price != null ? <Money value={r.fixed_price} /> : `${Math.abs(percent)}% ${percent < 0 ? 'off' : 'extra'}`}{r.variant_name ? <span className="font-normal text-gray-500"> · {r.variant_name}</span> : null}</p>
                    <p className="text-xs text-gray-500">{[r.list_name, Number(r.min_quantity) > 1 && `when buying ${Number(r.min_quantity)} or more`, r.group_name && `${r.group_name} customers only`, r.channel === 'online' ? 'online only' : r.channel === 'retail_pos' ? 'in the shop only' : null, ruleDates(r)].filter(Boolean).join(' · ')}</p>
                  </div>
                  <Badge tone={s.tone}>{s.label}</Badge>
                  {s.live && (ours(r)
                    ? <button type="button" className={smallButton} disabled={busy} onClick={() => stop(r)}>Stop</button>
                    : <Link href="/admin/products/pricing" className={smallButton}>Edit</Link>)}
                </li>
              );
            })}
          </ul>
        )}
        {draft ? (
          <div className="space-y-3 rounded-xl border border-gray-200 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={draft.mode === 'percent' ? 'Discount' : 'Sale price'}>
                <div className="flex gap-1.5">
                  <input aria-label="Sale price or discount" autoFocus type="number" min="0" step="0.01" className={inputClass} value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
                  <select aria-label="Price or percent" className={`${inputClass} w-24`} value={draft.mode} onChange={(e) => setDraft({ ...draft, mode: e.target.value })}><option value="price">Rs</option><option value="percent">% off</option></select>
                </div>
              </Field>
              <Field label="From"><input type="date" className={inputClass} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} /></Field>
              <Field label="Until (optional)"><input type="date" className={inputClass} min={draft.from || undefined} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} /></Field>
              <Field label="Buy at least" hint="1 = every sale"><input type="number" min="1" step="1" className={inputClass} value={draft.min_quantity} onChange={(e) => setDraft({ ...draft, min_quantity: e.target.value })} /></Field>
              {!single && (
                <Field label="Which version" className="sm:col-span-2">
                  <select className={inputClass} value={draft.variant_id} onChange={(e) => setDraft({ ...draft, variant_id: e.target.value })}><option value="">All versions</option>{product.variants.filter((v) => v.id).map((v) => <option key={v.id} value={v.id}>{v.variant_name}</option>)}</select>
                </Field>
              )}
            </div>
            <p className="text-xs text-gray-500">Starts at the beginning of the first day and ends after the last day. Billing and the online store use it automatically.</p>
            <div className="flex gap-2"><button type="button" className={primaryButton} disabled={busy} onClick={start}>{busy ? 'Saving…' : 'Save special price'}</button><button type="button" className={secondaryButton} onClick={() => setDraft(null)}>Cancel</button></div>
          </div>
        ) : (
          <button type="button" className={smallButton} onClick={() => setDraft({ mode: 'price', value: '', from: localToday(), to: '', min_quantity: '1', variant_id: '' })}><Plus className="h-3.5 w-3.5" aria-hidden /> Add a sale or buy-more price</button>
        )}
      </div>
    </section>
  );
}

const stockEdits = (variants) => variants.filter((v) => v.set_stock !== undefined && v.set_stock !== '' && Number(v.set_stock) !== Number(v.id ? v.available_stock || 0 : 0));

/**
 * Brings each version's shelf count to what was typed, as a counted-stock
 * correction (the same record Inventory → Adjustments makes), so stock history
 * and the ledger stay right. Returns what failed, as text.
 */
async function applyStockCounts(edits, freshVariants, defaultCost = null) {
  const problems = [];
  for (const edit of edits) {
    const name = String(edit.variant_name || 'Standard').trim();
    const saved = edit.id ? freshVariants.find((v) => v.id === edit.id) : freshVariants.find((v) => (v.variant_name || 'Standard') === name);
    if (!saved) { problems.push(`${name} (not found after saving)`); continue; }
    const delta = Number(edit.set_stock) - Number(saved.available_stock || 0);
    if (!delta) continue;
    try {
      await apiJson('/api/admin/retail-inventory-adjustments', { method: 'POST', body: JSON.stringify({
        type: 'MANUAL', variant_id: saved.id, quantity: delta, reason: edit.id ? 'COUNT_VARIANCE' : 'OPENING_STOCK', notes: 'Stock set on the product screen',
        unit_cost: delta > 0 ? (edit.set_cost !== '' && edit.set_cost != null ? Number(edit.set_cost) : defaultCost ?? undefined) : undefined,
        idempotency_key: `product-stock-${saved.id}-${Date.now()}`,
      }) });
    } catch (e) { problems.push(`${saved.variant_name || 'Standard'}: ${e.error || 'stock not updated'}`); }
  }
  return problems;
}

/** Shelf count, editable. Serial and batch items keep using the Stock screens. */
function StockInput({ variant, onChange, canCost, label, compact = false }) {
  const current = variant.id ? Number(variant.available_stock || 0) : 0;
  if (variant.tracking_mode && variant.tracking_mode !== 'none') return <span className="text-xs text-gray-500" title="Serial and batch stock is changed from the Stock screen">{current}</span>;
  const value = variant.set_stock ?? (variant.id ? current : '');
  const changed = value !== '' && Number(value) !== current;
  return (
    <span className={`flex flex-col gap-1 ${compact ? 'items-end' : ''}`}>
      <input aria-label={label} type="number" min="0" step="1" inputMode="numeric" value={value} placeholder="0" onChange={(e) => onChange({ set_stock: e.target.value })}
        className={`${inputClass} ${compact ? 'w-20 text-right' : ''} tabular-nums ${changed ? 'border-amber-400 bg-amber-50' : ''}`} />
      {changed && canCost && Number(value) > current && <input aria-label={`${label} cost each`} type="number" min="0" step="0.01" value={variant.set_cost ?? ''} placeholder="Cost each" onChange={(e) => onChange({ set_cost: e.target.value })} className={`${inputClass} ${compact ? 'w-24 text-right' : ''} text-xs`} />}
    </span>
  );
}

function BarcodeField({ variant, onChange, disabled, compact = false, label = 'Barcode' }) {
  const value = variant.barcode ?? '';
  const input = (
    <div className="flex gap-1.5">
      <input aria-label={label} className={`${inputClass} ${compact ? 'w-60' : ''} font-mono text-xs`} disabled={disabled} value={value} placeholder={variant.id ? 'None yet' : 'Created on save'} onChange={(e) => onChange(e.target.value)} />
      {!disabled && !value && variant.id && <button type="button" onClick={() => onChange(newCode())} className={`${smallButton} shrink-0`} title="Create a barcode for stickers"><Barcode className="h-3.5 w-3.5" aria-hidden /> Create</button>}
      {!disabled && value && !variant.id && <button type="button" aria-label="Clear barcode" onClick={() => onChange('')} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5" aria-hidden /></button>}
    </div>
  );
  return compact ? input : <Field label="Barcode">{input}</Field>;
}
