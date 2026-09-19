'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Printer, Search, Tags } from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import { useToast } from '@/components/ui/toast';
import { formatCurrency } from '@/lib/currency';
import { numbersOnlyInput } from '@/lib/form-validation';

/**
 * Sellable rows are products plus their variants, because a variant carries
 * its own barcode and price and is what actually gets scanned at the till.
 */
function toLabelRows(products) {
  const rows = [];
  for (const product of products) {
    const variants = product.variants || [];
    if (variants.length) {
      for (const variant of variants) {
        if (!variant.barcode) continue;
        rows.push({
          key: `v${variant.id}`,
          name: `${product.name} (${variant.variant_name})`,
          price: Number(variant.price ?? product.price ?? 0),
          barcode: String(variant.barcode),
        });
      }
      continue;
    }
    if (!product.barcode) continue;
    rows.push({
      key: `p${product.id}`,
      name: product.name,
      price: Number(product.price ?? product.base_price ?? 0),
      barcode: String(product.barcode),
    });
  }
  return rows;
}

function Barcode({ value }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      // CODE128 encodes any code the shop invents, so no check-digit rules to satisfy.
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        displayValue: true,
        fontSize: 12,
        height: 40,
        margin: 0,
      });
    } catch {
      /* an unencodable code just renders blank rather than breaking the sheet */
    }
  }, [value]);
  return <svg ref={ref} className="w-full" />;
}

export default function BarcodeLabelsPage() {
  const { notify } = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('pos_token');
        const response = await fetch('/api/admin/products', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Could not load products.');
        const data = await response.json();
        setProducts(data.products || []);
      } catch (error) {
        notify(error.message, 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [notify]);

  const rows = useMemo(() => toLabelRows(products), [products]);
  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(term) || r.barcode.includes(term));
  }, [rows, search]);

  const sheet = useMemo(
    () => rows.flatMap((row) => Array.from({ length: Number(counts[row.key]) || 0 }, (_, i) => ({ ...row, id: `${row.key}-${i}` }))),
    [rows, counts]
  );

  const setCount = useCallback((key, value) => {
    setCounts((prev) => ({ ...prev, [key]: numbersOnlyInput(value) }));
  }, []);

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-6">
        <div className="no-print flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <Tags className="h-6 w-6 text-gray-500" />
              Barcode labels
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Choose how many labels to print for each product, then print onto label stock.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!sheet.length}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Printer className="h-4 w-4" />
            Print {sheet.length ? `${sheet.length} label${sheet.length === 1 ? '' : 's'}` : ''}
          </button>
        </div>

        <div className="no-print rounded-xl border border-gray-200 bg-white">
          <div className="relative border-b border-gray-200 p-3">
            <Search className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by product name or barcode"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm text-gray-900"
            />
          </div>

          {loading ? (
            <p className="p-6 text-sm text-gray-500">Loading products…</p>
          ) : !rows.length ? (
            <p className="p-6 text-sm text-gray-500">
              No products have a barcode yet. Add one on a product in Products, then come back here to print its label.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {visibleRows.map((row) => (
                <li key={row.key} className="flex items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{row.name}</p>
                    <p className="font-mono text-xs text-gray-500">{row.barcode}</p>
                  </div>
                  <span className="text-sm text-gray-700">{formatCurrency(row.price)}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={counts[row.key] ?? ''}
                    onChange={(e) => setCount(row.key, e.target.value)}
                    placeholder="0"
                    aria-label={`Label count for ${row.name}`}
                    className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-center text-sm text-gray-900"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {sheet.length > 0 && (
          <div className="print-sheet grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {sheet.map((label) => (
              <div key={label.id} className="label-cell rounded-lg border border-gray-300 bg-white p-2 text-center">
                <p className="truncate text-xs font-semibold text-gray-900">{label.name}</p>
                <Barcode value={label.barcode} />
                <p className="text-xs font-bold text-gray-900">{formatCurrency(label.price)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx global>{`
        @media print {
          .no-print,
          nav,
          header,
          aside {
            display: none !important;
          }
          .print-sheet {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 4mm;
          }
          .label-cell {
            break-inside: avoid;
            border: none;
          }
          @page {
            margin: 6mm;
          }
        }
      `}</style>
    </AdminLayout>
  );
}
