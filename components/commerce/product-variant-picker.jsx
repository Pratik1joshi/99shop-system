'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { apiJson } from '@/lib/authed-fetch';
import { useCommerceSearch } from '@/components/commerce/use-commerce-search';

/** Choose a product once, then work with its exact stock identities. */
export default function ProductVariantPicker({ onPick, selectedIds = [], placeholder = 'Search product, SKU or barcode' }) {
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState(null);
  const [variants, setVariants] = useState([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [error, setError] = useState('');
  const matches = useCommerceSearch(query, { group: 'product_families', limit: 12, enabled: !product && query.trim().length > 1 });
  useEffect(() => {
    if (!product) return;
    const controller = new AbortController();
    apiJson(`/api/admin/commerce/search?group=product_variants&productId=${product.id}`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setVariants(result.groups[0]?.results || []); setError(''); } })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause.error || 'Could not load variants.'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingVariants(false); });
    return () => controller.abort();
  }, [product]);
  const choose = (row) => { setProduct(row); setQuery(''); setVariants([]); setError(''); setLoadingVariants(true); };
  return <div className="space-y-2">
    {product ? <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm"><strong className="text-blue-950">{product.title}</strong><button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => { setProduct(null); setVariants([]); setError(''); }}>Change product</button></div>
      : <div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" aria-hidden /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} aria-label={placeholder} className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm" />{(matches.groups[0]?.results || []).length > 0 && <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">{matches.groups[0].results.map((row) => <button key={row.id} type="button" className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => choose(row)}><strong>{row.title}</strong><small className="shrink-0 text-slate-500">{row.variant_count} variant{row.variant_count === 1 ? '' : 's'}</small></button>)}</div>}</div>}
    {loadingVariants && <p role="status" className="text-sm text-slate-500">Loading variants…</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {product && !loadingVariants && !error && <div className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">{variants.map((variant) => <button key={variant.id} type="button" disabled={selectedIds.includes(variant.id)} onClick={() => onPick(variant)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"><span><strong className="block">{variant.variant_name || 'Standard'}</strong><small className="text-slate-500">{variant.sku || `Variant #${variant.id}`}</small></span><span className="font-semibold text-blue-700">{selectedIds.includes(variant.id) ? 'Added' : 'Add'}</span></button>)}</div>}
    {product && !loadingVariants && !error && variants.length === 1 && <p className="text-xs text-slate-500">This product has only one variant. To stock colours or sizes separately, add them as variants in <a className="font-semibold text-blue-700 hover:underline" href={`/admin/products?product=${product.id}`} target="_blank" rel="noopener">Products</a>, then pick the product again.</p>}
  </div>;
}
