'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PackagePlus, PackageX, Sparkles } from 'lucide-react';
import { apiJson } from '@/lib/authed-fetch';
import { useCapabilities } from '@/lib/use-capabilities';

/**
 * What is running low, straight from the replenishment rules (available stock,
 * reservations, incoming orders and each SKU's reorder point). "Reorder" opens
 * the replenishment worklist with those items already ticked, where draft
 * purchase orders are made per supplier.
 */
export default function LowStockPanel({ limit = 6, className = '' }) {
  const { can, loading: capsLoading } = useCapabilities();
  const allowed = can('retail_inventory.view');
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (capsLoading || !allowed) return undefined;
    let live = true;
    apiJson('/api/admin/retail-inventory-reports/reorder')
      .then((data) => { if (live) setRows(data.suggestions || []); })
      .catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [allowed, capsLoading]);
  if (capsLoading || !allowed) return null;

  const sorted = [...(rows || [])].sort((a, b) => (a.status === b.status ? a.available - b.available : a.status === 'OUT_OF_STOCK' ? -1 : 1));
  const out = sorted.filter((r) => r.status === 'OUT_OF_STOCK').length;
  const canOrder = can('retail_purchasing.po.create');
  const reorderHref = (ids) => `/admin/retail-replenishment?variant=${ids.join(',')}`;

  return (
    <section aria-labelledby="low-stock-title" className={`flex min-h-0 flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="low-stock-title" className="flex items-center gap-2 text-base font-bold text-gray-900"><PackagePlus className="h-5 w-5 text-pink-600" aria-hidden />Running low</h2>
          <p className="mt-0.5 text-sm text-gray-500">{rows == null ? 'Checking stock…' : sorted.length ? `${sorted.length} item${sorted.length === 1 ? '' : 's'} at or below the reorder point${out ? ` · ${out} sold out` : ''}` : 'Nothing needs reordering right now.'}</p>
        </div>
        {sorted.length > 0 && canOrder && <Link href={reorderHref(sorted.map((r) => r.variantId))} className="shrink-0 rounded-xl bg-gray-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-gray-800">Reorder all</Link>}
      </div>

      {rows == null ? (
        <div className="mt-4 space-y-2" aria-hidden>{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-100" />)}</div>
      ) : sorted.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-pink-50/60 p-4 text-sm text-gray-600">
          <Sparkles className="h-5 w-5 shrink-0 text-pink-500" aria-hidden />
          <p>All stocked up. Items appear here once they have a reorder point, which you set on each product.</p>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100">
          {sorted.slice(0, limit).map((row) => {
            const point = Math.max(1, Number(row.reorderPoint) || 1);
            const pct = Math.max(0, Math.min(100, (Number(row.available) / point) * 100));
            const soldOut = row.status === 'OUT_OF_STOCK';
            return (
              <li key={row.variantId} className="flex items-center gap-3 py-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${soldOut ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{soldOut ? <PackageX className="h-4 w-4" aria-hidden /> : <PackagePlus className="h-4 w-4" aria-hidden />}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-gray-900">{row.productName}{row.variantName && row.variantName !== 'Standard' ? <span className="font-normal text-gray-500"> · {row.variantName}</span> : null}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100" aria-hidden><span className={`block h-full rounded-full ${soldOut ? 'bg-red-400' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} /></span>
                    <span className="text-xs text-gray-500">{soldOut ? 'Sold out' : `${Number(row.available)} left`} · reorder at {Number(row.reorderPoint)}{row.incomingQuantity > 0 ? ` · ${Number(row.incomingQuantity)} on order` : ''}</span>
                  </div>
                </div>
                {canOrder && <Link href={reorderHref([row.variantId])} className="shrink-0 rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-pink-300 hover:bg-pink-50" aria-label={`Reorder ${row.productName}`}>Reorder</Link>}
              </li>
            );
          })}
        </ul>
      )}
      {sorted.length > limit && <Link href="/admin/retail-replenishment" className="mt-2 self-start text-sm font-semibold text-pink-700 hover:underline">See all {sorted.length} →</Link>}
    </section>
  );
}
