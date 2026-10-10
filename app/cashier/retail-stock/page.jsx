'use client';

/**
 * Counter stock lookup. Read-only: the same sellable availability Billing
 * shows, searchable by name, SKU or barcode. No costs are exposed.
 */

import { Fragment, useState } from 'react';
import { Boxes, Loader2, Search } from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import { useCommerceSearch } from '@/components/commerce/use-commerce-search';
import { formatCurrency } from '@/lib/currency';

const STOCK_FILTERS = [
  { id: '', label: 'All' },
  { id: 'in_stock', label: 'In stock' },
  { id: 'low_stock', label: 'Low stock' },
  { id: 'out_of_stock', label: 'Out of stock' },
];

export default function CashierStockLookup() {
  const [query, setQuery] = useState('');
  const [stockStatus, setStockStatus] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const search = useCommerceSearch(query.trim(), { group: 'catalog_products', limit: 40, page, stockStatus });
  const group = search.groups[0];
  const rows = group?.results || [];

  return (
    <AdminLayout>
      <header className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 lg:px-8">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 sm:text-3xl"><Boxes className="h-7 w-7 text-lime-700" aria-hidden /> Stock lookup</h1>
        <p className="mt-1 text-sm text-gray-500">Stock available to sell at this counter. Scan or type a name, SKU or barcode.</p>
      </header>
      <div className="space-y-4 bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" aria-hidden />
            <input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search product, SKU or barcode..." aria-label="Search stock" className="w-full rounded-xl border-2 border-blue-200 py-2.5 pl-10 pr-3 text-gray-900 focus:border-blue-500 focus:outline-none" />
          </div>
          <div className="flex flex-wrap gap-2">
            {STOCK_FILTERS.map((f) => <button key={f.id || 'all'} type="button" aria-pressed={stockStatus === f.id} onClick={() => { setStockStatus(f.id); setPage(1); }} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${stockStatus === f.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>{f.label}</button>)}
          </div>
        </div>

        {search.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{search.error}</p>}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr><th className="px-5 py-3 font-semibold">Product</th><th className="px-5 py-3 font-semibold">SKU / barcode</th><th className="px-5 py-3 font-semibold">Category</th><th className="px-5 py-3 text-right font-semibold">Price</th><th className="px-5 py-3 text-right font-semibold">Available</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => {
                  const stock = Number(row.available_stock || 0);
                  return (
                    <Fragment key={row.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-5 py-3"><div className="font-medium text-gray-900">{row.title}</div>{row.variant_count > 1 && <button type="button" onClick={() => setExpanded(expanded === row.id ? null : row.id)} className="text-xs font-semibold text-blue-700 underline">{expanded === row.id ? 'Hide' : 'View'} {row.variant_count} options</button>}</td>
                        <td className="px-5 py-3 text-gray-600">{row.barcode || '—'}</td>
                        <td className="px-5 py-3 text-gray-600">{row.category_name || '—'}</td>
                        <td className="px-5 py-3 text-right tabular-nums text-gray-900">{formatCurrency(row.price)}{row.price_max !== row.price && <span className="block text-xs text-gray-500">to {formatCurrency(row.price_max)}</span>}</td>
                        <td className="px-5 py-3 text-right"><span className={`rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${stock <= 0 ? 'bg-red-100 text-red-700' : stock <= 5 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>{stock <= 0 ? 'Out of stock' : `${stock} total`}</span></td>
                      </tr>
                      {expanded === row.id && row.variants.map((variant) => <tr key={variant.id} className="bg-gray-50/70 text-xs">
                        <td className="py-2 pl-10 pr-5 text-gray-700">{variant.variant_name || 'Standard'}</td>
                        <td className="px-5 py-2 text-gray-600">{variant.sku || variant.barcode || '—'}</td>
                        <td className="px-5 py-2 text-gray-500">Option</td>
                        <td className="px-5 py-2 text-right tabular-nums">{formatCurrency(variant.price)}</td>
                        <td className="px-5 py-2 text-right">{Number(variant.available_stock) > 0 ? `${variant.available_stock} in stock` : 'Out of stock'}</td>
                      </tr>)}
                    </Fragment>
                  );
                })}
                {search.loading && !rows.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" aria-label="Loading stock" /></td></tr>}
                {!search.loading && !rows.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-500">No product found.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-sm text-gray-500">
            <span>Page {page}</span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-gray-300 px-3 py-1.5 font-medium text-gray-700 disabled:opacity-40">Previous</button>
              <button type="button" disabled={!group?.has_more} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-gray-300 px-3 py-1.5 font-medium text-gray-700 disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
