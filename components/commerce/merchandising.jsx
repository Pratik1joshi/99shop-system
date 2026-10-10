'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Barcode, Download, Grid3x3, Layers, Package, Plus, Printer, Sparkles, Trash2, Wand2 } from 'lucide-react';
import ProductMerchandising from './product-merchandising';
import CatalogImport from './catalog-import';
import CatalogSchedule from './catalog-schedule';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';
import { useCapabilities } from '@/lib/use-capabilities';
import { ActionDrawer } from '@/components/erp/primitives';
import { Badge, Field, Notice, Page, PageHeader, Panel, SearchPicker, inputClass, primaryButton, secondaryButton, smallButton } from './catalog-ui';

const fields = ['sku', 'variant_name', 'barcode', 'barcodes', 'mrp', 'price', 'wholesale_price', 'purchase_cost', 'reorder_point', 'reorder_quantity', 'tracking_mode', 'merchandising_active', 'supplier_id', 'supplier_sku'];
const labels = { sku: 'SKU', variant_name: 'Variant', barcode: 'Barcode', barcodes: 'Extra barcodes (|)', mrp: 'MRP', price: 'Price', wholesale_price: 'Wholesale', purchase_cost: 'Cost', reorder_point: 'Reorder at', reorder_quantity: 'Reorder qty', tracking_mode: 'Tracking', merchandising_active: 'Selling', supplier_id: 'Supplier ID', supplier_sku: 'Supplier SKU' };
const wide = new Set(['variant_name', 'barcodes', 'barcode', 'sku']);
// Default SKU prefix from the product name, e.g. 'Cold Coffee' -> 'COLDCOFF'.
const prefixFrom = (name) => String(name || '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8) || 'SKU';
const TABS = [{ id: 'grid', label: 'Variants & prices', icon: Grid3x3 }, { id: 'create', label: 'Create variants', icon: Wand2 }, { id: 'online', label: 'Online, images & suppliers', icon: Sparkles }];

export default function Merchandising() {
  const { can } = useCapabilities();
  const [product, setProduct] = useState(null);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('grid');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [skuStyle, setSkuStyle] = useState('sequence');
  const [bulkField, setBulkField] = useState('price');
  const [bulkValue, setBulkValue] = useState('');
  const [prefix, setPrefix] = useState('');
  const [axes, setAxes] = useState([{ name: 'Colour', values: 'Pink, Black' }, { name: 'Size', values: 'Small, Large' }]);
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('Update variants');
  const [percent, setPercent] = useState('5');
  const columns = fields.filter((field) => field !== 'purchase_cost' || can('retail_inventory.view_cost'));
  const selected = rows.filter((row) => row.selected);

  async function run(fn) { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e.message || e.error || 'Action failed.'); } finally { setBusy(false); } }
  async function load(item) {
    const id = item.product_id || item.id;
    await run(async () => {
      const data = await apiJson(`/api/admin/commerce/merchandising?product_id=${id}`);
      setProduct({ id, title: item.title || item.name });
      setPrefix(prefixFrom(item.title || item.name));
      setRows(data.rows.map((row) => ({ ...row, selected: true })));
      setPreview(null); setMessage(''); setTab('grid');
    });
  }
  // Products links here with ?product=12&name=… to open that product straight away.
  const loadOnMount = useRef(load);
  useEffect(() => { const q = new URLSearchParams(window.location.search); if (q.get('product')) loadOnMount.current({ id: Number(q.get('product')), name: q.get('name') || 'Product' }); }, []);
  const edit = (index, key, value) => { setRows((current) => current.map((row, i) => i === index ? { ...row, [key]: value } : row)); setPreview(null); };
  function paste(event, rowIndex, columnIndex) {
    const text = event.clipboardData.getData('text');
    if (!/[\t\n]/.test(text)) return;
    event.preventDefault();
    const cells = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((row) => row.split('\t'));
    setRows((current) => current.map((row, i) => {
      if (i < rowIndex || i >= rowIndex + cells.length) return row;
      const updates = {};
      cells[i - rowIndex].forEach((value, j) => { if (columns[columnIndex + j]) updates[columns[columnIndex + j]] = value; });
      return { ...row, ...updates };
    }));
    setPreview(null);
  }
  function key(event, row, column) {
    let next = null;
    if (event.key === 'ArrowDown') next = [row + 1, column];
    if (event.key === 'ArrowUp') next = [row - 1, column];
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); if (row > 0) edit(row, columns[column], rows[row - 1][columns[column]] ?? ''); return; }
    if (next) { event.preventDefault(); document.querySelector(`[data-matrix-cell="${next[0]}-${next[1]}"]`)?.focus(); }
  }
  const cellProps = (index, field, column) => ({ 'aria-label': `${labels[field]} row ${index + 1}`, 'data-matrix-cell': `${index}-${column}`, onKeyDown: (e) => key(e, index, column) });
  const requestPreview = () => run(async () => { setPreview(await apiJson('/api/admin/commerce/merchandising', { method: 'POST', body: JSON.stringify({ action: 'preview', product_id: product.id, rows: selected.map(({ selected: _s, ...row }) => row), reason }) })); });
  const exportCsv = () => run(async () => {
    const { authedRequest } = await import('@/lib/authed-fetch');
    const response = await authedRequest(`/api/admin/commerce/merchandising?product_id=${product.id}&format=csv`);
    if (!response.ok) throw new Error('Export failed.');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = `catalog-${product.id}.csv`; link.click(); URL.revokeObjectURL(url);
  });

  return (
    <>
      <PageHeader icon={Sparkles} tone="bg-fuchsia-50 text-fuchsia-600" title="Merchandising"
        description="Edit one product's variants (colour, size…) together: SKUs, barcodes, prices, reorder levels and what shows online."
        actions={<Link href="/admin/products/labels" className={secondaryButton}><Printer className="h-4 w-4" aria-hidden /> Barcode labels</Link>} />
      <Page>
        <Notice onClose={() => setError('')}>{error}</Notice>
        <Notice tone="success" onClose={() => setMessage('')}>{message}</Notice>

        {!product ? (
          <Panel title="Choose a product" description="Search by name, SKU or barcode.">
            <SearchPicker autoFocus dedupe="product_id" placeholder="Find a product…" onPick={load}
              renderRow={(row) => <><span className="font-medium text-gray-900">{row.title}</span><span className="text-xs text-gray-500">{row.category_name || ''}</span></>} />
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[[Grid3x3, 'Edit variants in a grid', 'Change prices, SKUs, barcodes and reorder levels for many variants at once, like a spreadsheet.'], [Wand2, 'Create variants', 'Type Colour: Pink, Black and Size: S, M and get every combination with SKUs.'], [Barcode, 'Barcodes and labels', 'Create missing barcodes for new variants, then print price stickers.']].map(([Icon, title, text]) => (
                <div key={title} className="rounded-xl border border-gray-200 p-4"><Icon className="mb-2 h-5 w-5 text-fuchsia-600" aria-hidden /><p className="font-semibold text-gray-900">{title}</p><p className="mt-1 text-sm text-gray-500">{text}</p></div>
              ))}
            </div>
          </Panel>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600"><Package className="h-5 w-5" aria-hidden /></div>
                <div><p className="text-lg font-bold text-gray-900">{product.title}</p><p className="text-xs text-gray-500">Product #{product.id} · {rows.filter((r) => r.id).length} saved variant{rows.filter((r) => r.id).length === 1 ? '' : 's'}{rows.some((r) => !r.id) ? ` · ${rows.filter((r) => !r.id).length} new (not saved yet)` : ''}</p></div>
              </div>
              <button type="button" className={secondaryButton} onClick={() => { setProduct(null); setRows([]); setPreview(null); }}>Change product</button>
            </div>

            <div role="tablist" className="flex flex-wrap gap-2">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} type="button" onClick={() => setTab(t.id)} className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold ${tab === t.id ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>
                  <t.icon className="h-4 w-4" aria-hidden />{t.label}
                </button>
              ))}
            </div>

            {tab === 'create' && (
              <Panel title="Create variants" description="List what varies. You get one variant for every combination; untick the ones you do not stock before saving.">
                <div className="space-y-2">
                  {axes.map((axis, index) => (
                    <div key={index} className="grid grid-cols-[10rem_1fr_auto] items-end gap-2">
                      <Field label={index === 0 ? 'Attribute' : ''}><input className={inputClass} value={axis.name} onChange={(e) => setAxes(axes.map((a, i) => i === index ? { ...a, name: e.target.value } : a))} placeholder="e.g. Colour" aria-label={`Attribute ${index + 1}`} /></Field>
                      <Field label={index === 0 ? 'Values (comma separated)' : ''}><input className={inputClass} value={axis.values} onChange={(e) => setAxes(axes.map((a, i) => i === index ? { ...a, values: e.target.value } : a))} placeholder="e.g. Pink, Black, Gold" aria-label={`Values ${index + 1}`} /></Field>
                      <button type="button" aria-label={`Remove attribute ${index + 1}`} onClick={() => setAxes(axes.filter((_, i) => i !== index))} className="mb-0.5 rounded-lg p-2.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" aria-hidden /></button>
                    </div>
                  ))}
                  <button type="button" className={smallButton} onClick={() => setAxes([...axes, { name: '', values: '' }])}><Plus className="h-3.5 w-3.5" aria-hidden /> Add attribute</button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Field label="SKU prefix" hint="Required. e.g. CLIP → CLIP-001"><input className={inputClass} value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} /></Field>
                  <Field label="SKU style"><select className={inputClass} value={skuStyle} onChange={(e) => setSkuStyle(e.target.value)}><option value="sequence">Prefix + number (CLIP-001)</option><option value="attributes">Prefix + attribute codes (CLIP-PNK-S)</option></select></Field>
                  <Field label="Starting price (Rs)"><input className={inputClass} type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
                </div>
                <button type="button" className={`${primaryButton} mt-4`} disabled={busy || !prefix.trim() || !axes.some((a) => a.name.trim() && a.values.trim())} onClick={() => run(async () => {
                  const data = await apiJson('/api/admin/commerce/merchandising', { method: 'POST', body: JSON.stringify({ action: 'matrix', prefix, price, sku_style: skuStyle, axes: axes.filter((a) => a.name.trim() && a.values.trim()).map((a) => ({ name: a.name.trim(), values: a.values.split(',').map((v) => v.trim()).filter(Boolean) })) }) });
                  setRows(data.rows); setPreview(null); setTab('grid');
                  setMessage(`${data.rows.length} combinations ready. Untick any you do not stock, check prices, then press “Review changes”.`);
                })}><Wand2 className="h-4 w-4" aria-hidden /> Make combinations</button>
              </Panel>
            )}

            {tab === 'online' && <ProductMerchandising key={product.id} productId={product.id} variants={rows} />}

            {tab === 'grid' && (
              <>
                <Panel title="Quick actions" description={`${selected.length} of ${rows.length} variants selected. Actions change the selected rows in the grid; nothing is saved until you review.`}
                  actions={<><button type="button" className={smallButton} onClick={() => setRows((c) => c.map((r) => ({ ...r, selected: true })))}>Select all</button><button type="button" className={smallButton} onClick={() => setRows((c) => c.map((r) => ({ ...r, selected: false })))}>Select none</button></>}>
                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="space-y-2 rounded-xl bg-gray-50 p-3">
                      <p className="text-sm font-semibold text-gray-900">Set the same value</p>
                      <div className="flex gap-2">
                        <select aria-label="Bulk field" className={inputClass} value={bulkField} onChange={(e) => setBulkField(e.target.value)}>{columns.filter((field) => !['sku', 'variant_name', 'barcode', 'barcodes', 'supplier_sku'].includes(field)).map((field) => <option key={field} value={field}>{labels[field]}</option>)}</select>
                        <input aria-label="Bulk value" className={`${inputClass} w-28`} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
                      </div>
                      <button type="button" className={smallButton} disabled={!selected.length} onClick={() => { setRows((c) => c.map((r) => r.selected ? { ...r, [bulkField]: bulkValue } : r)); setPreview(null); }}>Apply to selected</button>
                    </div>
                    <div className="space-y-2 rounded-xl bg-gray-50 p-3">
                      <p className="text-sm font-semibold text-gray-900">Change price by %</p>
                      <input aria-label="Retail change percent" type="number" className={inputClass} value={percent} onChange={(e) => setPercent(e.target.value)} />
                      <button type="button" className={smallButton} disabled={!selected.length} onClick={() => { if (!Number.isFinite(Number(percent)) || Number(percent) < -100) return setError('Enter a valid percentage.'); setRows((c) => c.map((r) => r.selected ? { ...r, price: Math.round(Number(r.price) * (1 + Number(percent) / 100) * 100) / 100 } : r)); setPreview(null); }}>Apply to selected</button>
                    </div>
                    <div className="space-y-2 rounded-xl bg-gray-50 p-3">
                      <p className="text-sm font-semibold text-gray-900">Barcodes, labels & files</p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className={smallButton} disabled={busy || !selected.some((r) => !r.barcode)} onClick={() => run(async () => {
                          const data = await apiJson('/api/admin/commerce/merchandising', { method: 'POST', body: JSON.stringify({ action: 'barcodes', count: selected.filter((r) => !r.barcode).length }) });
                          setRows((current) => { let i = 0; return current.map((r) => r.selected && !r.barcode ? { ...r, barcode: data.barcodes[i++] } : r); }); setPreview(null);
                        })}><Barcode className="h-3.5 w-3.5" aria-hidden /> Create missing barcodes</button>
                        <Link className={smallButton} href={`/admin/products/labels?ids=${selected.filter((r) => r.id).slice(0, 200).map((r) => r.id).join(',')}`}><Printer className="h-3.5 w-3.5" aria-hidden /> Print labels</Link>
                        <CatalogSchedule rows={selected} reason={reason} onSaved={setMessage} />
                        <CatalogImport productId={product.id} reason={reason} onPreview={setPreview} costAccess={can('retail_inventory.view_cost')} />
                        <button type="button" className={smallButton} onClick={exportCsv}><Download className="h-3.5 w-3.5" aria-hidden /> Export CSV</button>
                      </div>
                    </div>
                  </div>
                </Panel>

                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" aria-label="Variant matrix">
                      <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr><th className="sticky left-0 z-10 bg-gray-50 px-3 py-2.5"><span className="sr-only">Select</span></th>{columns.map((field) => <th key={field} className="whitespace-nowrap px-2 py-2.5 font-semibold">{labels[field]}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rows.map((row, index) => (
                          <tr key={row.id || row.merchandising_signature || index} className={row.selected ? 'bg-white' : 'bg-gray-50 opacity-60'}>
                            <td className="sticky left-0 z-10 bg-inherit px-3 py-1.5"><input aria-label={`Select variant ${index + 1}`} type="checkbox" checked={!!row.selected} onChange={(e) => edit(index, 'selected', e.target.checked)} className="h-4 w-4" />{!row.id && <span className="ml-1"><Badge tone="blue">New</Badge></span>}</td>
                            {columns.map((field, column) => (
                              <td key={field} className="px-1 py-1">
                                {field === 'tracking_mode' ? (
                                  <select {...cellProps(index, field, column)} value={row[field] || 'none'} onChange={(e) => edit(index, field, e.target.value)} className={`${inputClass} h-9 w-28`}><option value="none">Quantity</option><option value="batch">Batch / expiry</option><option value="serial">Serial number</option></select>
                                ) : field === 'merchandising_active' ? (
                                  <span className="flex justify-center"><input type="checkbox" {...cellProps(index, field, column)} checked={Number(row[field] ?? 1) === 1} onChange={(e) => edit(index, field, e.target.checked ? 1 : 0)} className="h-4 w-4" /></span>
                                ) : (
                                  <input {...cellProps(index, field, column)} className={`${inputClass} h-9 ${wide.has(field) ? 'min-w-40' : 'w-24'}`} value={Array.isArray(row[field]) ? row[field].join('|') : row[field] ?? ''} onChange={(e) => edit(index, field, e.target.value)} onPaste={(e) => paste(e, index, column)} />
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {!rows.length && <tr><td colSpan={columns.length + 1} className="px-4 py-10 text-center text-gray-500">This product has no variants yet. Use “Create variants”.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">Tip: paste a block from Excel or Google Sheets into any cell. ↑/↓ move between rows, Ctrl+D copies the cell above.</p>
                </div>

                <div className="sticky bottom-0 z-20 flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-lg">
                  <Field label="Note for the change log" className="min-w-60 flex-1"><input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
                  <button type="button" className={primaryButton} disabled={busy || !selected.length || !reason.trim()} onClick={requestPreview}><Layers className="h-4 w-4" aria-hidden /> Review {selected.length} change{selected.length === 1 ? '' : 's'}</button>
                </div>
              </>
            )}
          </>
        )}
      </Page>

      <ActionDrawer open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }} title="Check before saving" description="These are the exact changes. Stock and past sales keep their link to each SKU."
        footer={preview && <button type="button" className={`${primaryButton} w-full`} disabled={busy} onClick={() => run(async () => {
          const result = await apiJson('/api/admin/commerce/merchandising', { method: 'POST', body: JSON.stringify({ action: 'apply', job_id: preview.id }) });
          const data = await apiJson(`/api/admin/commerce/merchandising?product_id=${product.id}`);
          setRows(data.rows.map((row) => ({ ...row, selected: true }))); setPreview(null); setMessage(`${result.count} variants saved.`);
        })}>Save {preview.rows.length} change{preview.rows.length === 1 ? '' : 's'}</button>}>
        {preview && (
          <div className="space-y-3">
            <div className="flex gap-2"><Badge tone="blue">{preview.create_count} new</Badge><Badge tone="amber">{preview.update_count} updated</Badge></div>
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {preview.rows.map((row, index) => {
                const changes = Object.keys(row.after).filter((k) => !['price', 'id', 'selected', 'merchandising_signature'].includes(k) && JSON.stringify(row.after[k]) !== JSON.stringify(row.before?.[k]));
                return (
                  <li key={index} className="px-3 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-gray-900">{row.after.sku || row.after.variant_name}</span>
                      <span className="tabular-nums">{row.before ? <><span className="text-gray-400 line-through">{formatCurrency(row.before.price)}</span> </> : <Badge tone="blue">New</Badge>} <span className="font-semibold">{formatCurrency(row.after.price)}</span></span>
                    </div>
                    {changes.length > 0 && <p className="mt-1 text-xs text-gray-500">{changes.map((k) => `${labels[k] || k}: ${typeof row.after[k] === 'object' ? JSON.stringify(row.after[k]) : String(row.after[k] ?? '—')}`).join(' · ')}</p>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </ActionDrawer>
    </>
  );
}
