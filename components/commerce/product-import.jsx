'use client';
/** Bulk upload: download the sample, fill it in Excel, upload, check, import. */
import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Printer, Upload } from 'lucide-react';
import { ActionDrawer, Money } from '@/components/erp/primitives';
import { apiJson } from '@/lib/authed-fetch';
import { PRODUCT_CSV_SAMPLE } from '@/lib/retail-catalog-matrix';
import { Badge, Notice, primaryButton, secondaryButton } from './catalog-ui';

const GUIDE = [
  ['name', 'Required. Rows with the same name become one product.'],
  ['price', 'Required. Selling price in Rs.'],
  ['category', 'New names are created for you.'],
  ['brand', 'Optional.'],
  ['mrp', 'Optional. Printed on the label when above the price.'],
  ['barcode', 'Code printed on the item. Leave empty and one is created.'],
  ['sku', 'Optional. Your own item code.'],
  ['colour, size', 'One row per colour or size makes the versions.'],
  ['wholesale_price', 'Optional. For wholesale customers.'],
  ['description', 'Optional.'],
];

function downloadSample() {
  const url = URL.createObjectURL(new Blob(['﻿', PRODUCT_CSV_SAMPLE], { type: 'text/csv;charset=utf-8' }));
  Object.assign(document.createElement('a'), { href: url, download: 'products-sample.csv' }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function priceRange(versions) {
  const prices = versions.map((v) => Number(v.price)).filter(Number.isFinite);
  if (!prices.length) return '—';
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return low === high ? <Money value={low} /> : <><Money value={low} /> – <Money value={high} /></>;
}

function Step({ number, title, children }) {
  return (
    <section className="rounded-2xl border border-gray-200 p-4">
      <h3 className="mb-3 flex items-center gap-2 font-semibold text-gray-900"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-xs text-white">{number}</span>{title}</h3>
      {children}
    </section>
  );
}

export default function ProductImport({ open, onOpenChange, onImported, labelsHref }) {
  const [file, setFile] = useState(null);
  const [plan, setPlan] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const reset = () => { setFile(null); setPlan(null); setDone(null); setError(''); };

  async function check(selected) {
    if (!selected) return;
    reset(); setBusy(true);
    try {
      if (!/\.csv$/i.test(selected.name)) throw new Error('Please upload a .csv file. In Excel: File → Save As → “CSV UTF-8”.');
      if (selected.size > 2_000_000) throw new Error('The file must be smaller than 2 MB. Split it into two files.');
      const csv = await selected.text();
      setFile({ name: selected.name, csv });
      setPlan(await apiJson('/api/admin/commerce/products/import', { method: 'POST', body: JSON.stringify({ csv }) }));
    } catch (e) { setError(e.error || e.message || 'Could not read this file.'); } finally { setBusy(false); }
  }
  async function importNow() {
    setBusy(true); setError('');
    try {
      setDone(await apiJson('/api/admin/commerce/products/import', { method: 'POST', body: JSON.stringify({ csv: file.csv, confirm: true }) }));
      setPlan(null);
      onImported();
    } catch (e) { setError(e.error || 'Import failed. Nothing was added.'); } finally { setBusy(false); }
  }

  const blocked = !plan || plan.errors.length > 0 || plan.counts.products === 0;
  return (
    <ActionDrawer wide open={open} onOpenChange={(value) => { if (!value) reset(); onOpenChange(value); }} title="Bulk upload products" description="Add many products at once from a spreadsheet."
      footer={plan && <button type="button" className={`${primaryButton} w-full py-3`} disabled={busy || blocked} onClick={importNow}>{busy ? 'Importing…' : `Import ${plan.counts.products} product${plan.counts.products === 1 ? '' : 's'}`}</button>}>
      <div className="space-y-4 pb-4">
        <Notice onClose={() => setError('')}>{error}</Notice>
        {done ? (
          <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
            <p className="flex items-center gap-2 text-lg font-semibold"><CheckCircle2 className="h-5 w-5" aria-hidden /> Added {done.products} product{done.products === 1 ? '' : 's'} ({done.versions} version{done.versions === 1 ? '' : 's'}).</p>
            {done.skipped > 0 && <p className="text-sm">{done.skipped} {done.skipped === 1 ? 'was' : 'were'} already in Products and left unchanged.</p>}
            <p className="text-sm">Every one has a barcode. Add stock from Inventory when the goods arrive.</p>
            <div className="flex flex-wrap gap-2">
              <Link href={labelsHref(done.variant_ids)} className={primaryButton}><Printer className="h-4 w-4" aria-hidden /> Print labels for them</Link>
              <button type="button" className={secondaryButton} onClick={reset}>Upload another file</button>
            </div>
            {done.variant_ids.length > 200 && <p className="text-xs">Labels open for the first 200 versions. Print the rest from Products.</p>}
          </div>
        ) : (
          <>
            <Step number="1" title="Get the sample file">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">Open it in Excel or Google Sheets, replace the example rows with your products, then save as CSV.</p>
                <button type="button" className={secondaryButton} onClick={downloadSample}><Download className="h-4 w-4" aria-hidden /> Download sample CSV</button>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {GUIDE.map(([name, help]) => <div key={name} className="flex gap-2"><dt className="shrink-0 font-mono text-xs font-semibold leading-5 text-gray-900">{name}</dt><dd className="text-gray-500">{help}</dd></div>)}
              </dl>
              <p className="mt-3 text-xs text-gray-500">Stock is not uploaded here. Receive it in Inventory so the cost reaches your accounts.</p>
            </Step>

            <Step number="2" title="Upload your file">
              <label onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); check(e.dataTransfer.files?.[0]); }}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center ${dragging ? 'border-gray-900 bg-gray-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}`}>
                {file ? <FileSpreadsheet className="h-8 w-8 text-emerald-600" aria-hidden /> : <Upload className="h-8 w-8 text-gray-400" aria-hidden />}
                <span className="font-semibold text-gray-900">{busy && !plan ? 'Checking…' : file ? file.name : 'Choose a CSV file or drop it here'}</span>
                <span className="text-xs text-gray-500">{file ? 'Choose another file to replace it' : 'Up to 1,000 rows'}</span>
                <input aria-label="Upload products CSV" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { check(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            </Step>

            {plan && (
              <Step number="3" title="Check and import">
                <div className="mb-3 flex flex-wrap gap-2">
                  <Badge tone="green">{plan.counts.products} new product{plan.counts.products === 1 ? '' : 's'}</Badge>
                  <Badge tone="blue">{plan.counts.versions} version{plan.counts.versions === 1 ? '' : 's'}</Badge>
                  {plan.new_categories.length > 0 && <Badge tone="violet">New categories: {plan.new_categories.join(', ')}</Badge>}
                  {plan.counts.skipped > 0 && <Badge>{plan.counts.skipped} already in Products, skipped</Badge>}
                  {plan.ignored_columns.length > 0 && <Badge tone="amber">Ignored columns: {plan.ignored_columns.join(', ')}</Badge>}
                </div>
                {plan.errors.length > 0 && (
                  <div role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <p className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden /> Fix {plan.errors.length === 1 ? 'this' : `these ${plan.errors.length}`} in your file, then upload it again. Nothing has been added.</p>
                    <ul className="list-disc space-y-0.5 pl-6">{plan.errors.slice(0, 30).map((e, i) => <li key={i}>Row {e.line}: {e.message}</li>)}</ul>
                    {plan.errors.length > 30 && <p className="mt-1">…and {plan.errors.length - 30} more.</p>}
                  </div>
                )}
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Versions</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2">Barcode</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {plan.products.slice(0, 100).map((p) => {
                        const typed = p.versions.filter((v) => v.barcode).length;
                        return (
                          <tr key={p.name} className={p.status === 'exists' ? 'text-gray-400' : ''}>
                            <td className="px-3 py-2 font-semibold">{p.name}{p.status === 'exists' && <span className="ml-2"><Badge>Already added · skipped</Badge></span>}</td>
                            <td className="px-3 py-2">{p.category || 'Uncategorized'}{p.new_category && <span className="ml-1"><Badge tone="violet">new</Badge></span>}</td>
                            <td className="px-3 py-2">{p.versions.length === 1 && p.versions[0].variant_name === 'Standard' ? '—' : <span className="flex flex-wrap gap-1">{p.versions.map((v) => <Badge key={v.line} tone="blue">{v.variant_name}</Badge>)}</span>}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{priceRange(p.versions)}</td>
                            <td className="px-3 py-2 text-xs text-gray-500">{typed === p.versions.length ? 'From file' : typed ? `${typed} from file, ${p.versions.length - typed} created` : 'Created for you'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {plan.products.length > 100 && <p className="mt-2 text-xs text-gray-500">Showing the first 100 of {plan.products.length} products.</p>}
              </Step>
            )}
          </>
        )}
      </div>
    </ActionDrawer>
  );
}
