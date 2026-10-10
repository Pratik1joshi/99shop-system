'use client';
import { useState } from 'react';
import { Upload } from 'lucide-react';
import { parseCatalogCsv } from '@/lib/retail-catalog-matrix';
import { apiJson } from '@/lib/authed-fetch';
import { ActionDrawer } from '@/components/erp/primitives';
import { Field, Notice, inputClass, primaryButton, smallButton } from './catalog-ui';

const fields = ['id', 'sku', 'variant_name', 'barcode', 'barcodes', 'price', 'mrp', 'wholesale_price', 'purchase_cost', 'wholesale_min_quantity', 'reorder_point', 'reorder_quantity', 'tracking_mode', 'merchandising_active', 'attributes'];

export default function CatalogImport({ productId, reason, onPreview, costAccess }) {
  const [file, setFile] = useState(null);
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function read(selected) {
    if (!selected) return;
    try {
      if (selected.size > 2000000) throw new Error('The CSV must be smaller than 2 MB.');
      const csv = await selected.text();
      const rows = parseCatalogCsv(csv);
      const headers = Object.keys(rows[0]);
      setFile({ csv, headers, count: rows.length, name: selected.name });
      setMapping(Object.fromEntries(fields.filter((field) => headers.includes(field)).map((field) => [field, field])));
      setError('');
    } catch (e) { setError(e.message); }
  }
  return (
    <>
      <label className={`${smallButton} cursor-pointer`}>
        <Upload className="h-3.5 w-3.5" aria-hidden /> Import CSV
        <input aria-label="Import catalog CSV" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { read(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {error && !file && <span role="alert" className="text-xs text-red-700">{error}</span>}
      <ActionDrawer open={!!file} onOpenChange={(open) => { if (!open) setFile(null); }} title="Match your spreadsheet columns" description="Tell us which column holds which detail. Rows with a known SKU or ID update that variant; others are added. Stock quantities are never imported here."
        footer={file && <button type="button" className={`${primaryButton} w-full`} disabled={busy || !reason.trim()} onClick={async () => {
          setBusy(true); setError('');
          try { onPreview(await apiJson('/api/admin/commerce/merchandising', { method: 'POST', body: JSON.stringify({ action: 'preview', product_id: productId, csv: file.csv, mapping, reason }) })); setFile(null); }
          catch (e) { setError(e.error || e.message || 'The file did not pass the checks.'); } finally { setBusy(false); }
        }}>Check and preview</button>}>
        {file && (
          <div className="space-y-4">
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm"><span className="font-semibold">{file.name}</span> · {file.count} rows</p>
            <Notice onClose={() => setError('')}>{error}</Notice>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.filter((field) => field !== 'purchase_cost' || costAccess).map((field) => (
                <Field key={field} label={field.replaceAll('_', ' ')}>
                  <select className={inputClass} value={mapping[field] || ''} onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}><option value="">Skip</option>{file.headers.map((header) => <option value={header} key={header}>{header}</option>)}</select>
                </Field>
              ))}
            </div>
            <p className="text-xs text-gray-500">Change log note: {reason || 'enter one in the grid first.'}</p>
          </div>
        )}
      </ActionDrawer>
    </>
  );
}
