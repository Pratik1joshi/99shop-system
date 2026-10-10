'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import JsBarcode from 'jsbarcode';
import { AlertTriangle, Barcode as BarcodeIcon, Minus, Plus, Printer, Tags, Trash2 } from 'lucide-react';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';
import { SHOP } from '@/lib/shop-info';
import { Badge, EmptyHint, Notice, Page, PageHeader, Panel, SearchPicker, Toggle, inputClass, primaryButton, secondaryButton, smallButton } from './catalog-ui';

const SIZES = [
  { id: '50', label: '50 × 40 mm', hint: 'Standard price sticker' },
  { id: '40', label: '40 × 40 mm', hint: 'Small square sticker' },
];
const printable = (code) => !!code && /^[\x20-\x7e]{1,128}$/.test(code);

function Barcode({ value }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) JsBarcode(ref.current, value, { format: 'CODE128', displayValue: true, fontSize: 10, height: 30, margin: 0 }); }, [value]);
  return <svg ref={ref} className="w-full" />;
}

function Label({ row, width, show }) {
  return (
    <div className="label-cell flex flex-col items-center justify-center gap-0.5 border border-gray-300 bg-white p-2 text-center text-black" style={{ width: `${width}mm`, minHeight: '40mm' }}>
      {show.shop && <small className="text-[9px] uppercase tracking-wide">{SHOP.name}</small>}
      <p className="line-clamp-2 text-xs font-semibold leading-tight">{row.name}</p>
      {row.variant_name && row.variant_name !== 'Standard' && <p className="text-[10px]">{row.variant_name}</p>}
      <Barcode value={row.barcode} />
      {show.sku && row.sku && <p className="text-[10px]">{row.sku}</p>}
      <p className="text-sm font-bold">{formatCurrency(row.price)}{show.mrp && row.mrp != null && Number(row.mrp) > Number(row.price) ? <span className="ml-1 text-[10px] font-normal">MRP {formatCurrency(row.mrp)}</span> : null}</p>
    </div>
  );
}

export default function BarcodeLabels() {
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [stock, setStock] = useState({});
  const [error, setError] = useState('');
  const [size, setSize] = useState('50');
  const [show, setShow] = useState({ shop: true, sku: true, mrp: true });
  const [creating, setCreating] = useState(false);

  async function add(ids, stockById = {}) {
    try {
      const result = await apiJson(`/api/admin/commerce/labels?ids=${ids.join(',')}`);
      setRows((current) => [...current, ...result.rows.filter((row) => !current.some((old) => old.id === row.id))]);
      setCounts((current) => ({ ...current, ...Object.fromEntries(result.rows.map((row) => [row.id, current[row.id] || 1])) }));
      setStock((current) => ({ ...current, ...stockById }));
      setError('');
    } catch (e) { setError(e.error || e.message || 'Could not load these products.'); }
  }
  // Merchandising links here with ?ids=1,2,3 to print a selection.
  const loadedFromUrl = useRef(false);
  const addOnMount = useRef(add);
  useEffect(() => {
    if (loadedFromUrl.current) return;
    loadedFromUrl.current = true;
    const selected = new URLSearchParams(window.location.search).get('ids');
    if (selected) addOnMount.current(selected.split(',').map(Number).filter(Boolean));
  }, []);

  const ready = rows.filter((row) => printable(row.barcode));
  const missing = rows.filter((row) => !printable(row.barcode));
  const total = ready.reduce((sum, row) => sum + (Number(counts[row.id]) || 0), 0);
  const tooMany = total > 1000;
  const sheet = tooMany ? [] : ready.flatMap((row) => Array.from({ length: Math.max(0, Number(counts[row.id]) || 0) }, (_, index) => ({ ...row, key: `${row.id}-${index}` })));
  const setCount = (id, value) => setCounts((current) => ({ ...current, [id]: Math.max(0, Math.min(1000, Math.floor(Number(value) || 0))) }));

  return (
    <>
      <div className="print:hidden">
        <PageHeader icon={Tags} tone="bg-slate-100 text-slate-700" actions={<Link href="/admin/products" className={secondaryButton}>Back to Products</Link>} title="Barcode labels" description="Print price stickers with a scannable barcode. Pick products, choose how many stickers each, then print on your label paper." />
        <Page>
          <Notice onClose={() => setError('')}>{error}</Notice>
          <Panel title="1. Choose products" description="Search by name, SKU or barcode. Each size or colour (variant) is its own label.">
            <SearchPicker placeholder="Search products to add…" onPick={(row) => add([row.id], { [row.id]: Number(row.available_stock || 0) })} />
          </Panel>

          <Panel title="2. How many stickers" description="Usually one per item on the shelf. “Match stock” sets the count to what you have in stock."
            actions={ready.length > 0 && <>
              <button type="button" className={smallButton} onClick={() => ready.forEach((row) => setCount(row.id, 1))}>All to 1</button>
              <button type="button" className={smallButton} onClick={() => ready.forEach((row) => stock[row.id] != null && setCount(row.id, stock[row.id]))}>Match stock</button>
              <button type="button" className={smallButton} onClick={() => { setRows([]); setCounts({}); }}>Clear list</button>
            </>}>
            {rows.length === 0 ? (
              <EmptyHint icon={BarcodeIcon} title="No products yet">Use the search above, or tick products on the Products page and press “Print labels”.</EmptyHint>
            ) : (
              <ul className="divide-y divide-gray-100">
                {rows.map((row) => {
                  const ok = printable(row.barcode);
                  return (
                    <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-gray-900">{row.name}{row.variant_name && row.variant_name !== 'Standard' ? ` · ${row.variant_name}` : ''}</p>
                        <p className="text-xs text-gray-500">{row.sku || 'No SKU'} · {formatCurrency(row.price)}{stock[row.id] != null ? ` · ${stock[row.id]} in stock` : ''}</p>
                      </div>
                      {ok ? <Badge tone="green">Barcode {row.barcode}</Badge> : <Badge tone="amber">No barcode — cannot print</Badge>}
                      {ok && (
                        <div className="flex items-center gap-1">
                          <button type="button" aria-label={`Fewer labels for ${row.name}`} onClick={() => setCount(row.id, (counts[row.id] || 0) - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"><Minus className="h-3.5 w-3.5" aria-hidden /></button>
                          <input aria-label={`Label count for ${row.name}`} type="number" min="0" max="1000" value={counts[row.id] ?? 0} onChange={(e) => setCount(row.id, e.target.value)} className={`${inputClass} h-8 w-16 text-center`} />
                          <button type="button" aria-label={`More labels for ${row.name}`} onClick={() => setCount(row.id, (counts[row.id] || 0) + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"><Plus className="h-3.5 w-3.5" aria-hidden /></button>
                        </div>
                      )}
                      <button type="button" aria-label={`Remove ${row.name}`} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" aria-hidden /></button>
                    </li>
                  );
                })}
              </ul>
            )}
            {missing.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                <span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{missing.length === 1 ? '1 product has' : `${missing.length} products have`} no barcode yet.</span>
                <button type="button" className={primaryButton} disabled={creating} onClick={async () => {
                  setCreating(true); setError('');
                  try {
                    const ids = missing.map((row) => row.id);
                    await apiJson('/api/admin/commerce/labels', { method: 'POST', body: JSON.stringify({ action: 'assign_missing', ids }) });
                    const fresh = await apiJson(`/api/admin/commerce/labels?ids=${ids.join(',')}`);
                    setRows((current) => current.map((row) => fresh.rows.find((r) => r.id === row.id) || row));
                  } catch (e) { setError(e.error || 'Could not create barcodes.'); } finally { setCreating(false); }
                }}><BarcodeIcon className="h-4 w-4" aria-hidden />{creating ? 'Creating…' : 'Create barcodes for them'}</button>
              </div>
            )}
          </Panel>

          <Panel title="3. Sticker layout and print" description="Set your printer to the same label size and 100% scale.">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {SIZES.map((option) => (
                    <button key={option.id} type="button" aria-pressed={size === option.id} onClick={() => setSize(option.id)}
                      className={`rounded-xl border-2 p-3 text-left ${size === option.id ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <span className="block font-semibold text-gray-900">{option.label}</span>
                      <span className="text-xs text-gray-500">{option.hint}</span>
                    </button>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Toggle checked={show.shop} onChange={(v) => setShow({ ...show, shop: v })} label="Shop name" />
                  <Toggle checked={show.sku} onChange={(v) => setShow({ ...show, sku: v })} label="SKU" />
                  <Toggle checked={show.mrp} onChange={(v) => setShow({ ...show, mrp: v })} label="MRP" description="Only when above price" />
                </div>
                {tooMany && <Notice>Print at most 1,000 labels at a time. Lower some counts.</Notice>}
                <button type="button" className={`${primaryButton} w-full py-3 text-base`} disabled={!sheet.length} onClick={() => window.print()}>
                  <Printer className="h-5 w-5" aria-hidden /> Print {sheet.length} label{sheet.length === 1 ? '' : 's'}
                </button>
                <p className="text-xs text-gray-500">Barcodes are CODE128. 13-digit codes starting with 2 (and older INT- codes) are this shop’s own, not a maker’s barcode.</p>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Preview</p>
                <div className="flex min-h-[40mm] items-center justify-center rounded-xl bg-gray-100 p-4">
                  {ready[0] ? <Label row={ready[0]} width={size} show={show} /> : <p className="text-sm text-gray-400">Add a product with a barcode</p>}
                </div>
              </div>
            </div>
          </Panel>
        </Page>
      </div>
      <div className="label-sheet hidden flex-wrap print:flex" aria-label="Label sheet">
        {sheet.map((row) => <Label key={row.key} row={row} width={size} show={show} />)}
      </div>
      <style jsx global>{`@media print { .label-sheet { position:absolute; left:0; top:0; gap:0; } .label-cell { break-inside:avoid; border:0 !important; } @page { margin:5mm; } }`}</style>
    </>
  );
}
