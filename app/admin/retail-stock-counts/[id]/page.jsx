'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, ScanLine } from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import { Button } from '@/components/ui/button';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';
import { useToast } from '@/components/ui/toast';
import { friendlyFromError, friendlyMessage } from '@/lib/friendly-message';

const STATUS_BADGE = {
  COUNTING: 'bg-amber-100 text-amber-800', REVIEW: 'bg-blue-100 text-blue-800',
  POSTED: 'bg-emerald-100 text-emerald-800', CANCELLED: 'bg-red-100 text-red-700',
};

export default function RetailStockCountDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { addToast } = useToast();
  const [count, setCount] = useState(undefined);
  const [capabilities, setCapabilities] = useState({});
  const [busy, setBusy] = useState(false);
  const [scanCode, setScanCode] = useState('');

  const load = useCallback(() => {
    apiJson(`/api/admin/retail-stock-counts/${id}`).then((d) => setCount(d.retail_stock_count)).catch(() => setCount(null));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { apiJson('/api/auth/capabilities').then((d) => setCapabilities(d.capabilities || {})).catch(() => {}); }, []);

  const canApprove = !!capabilities['retail_inventory.count.approve'];

  const setQty = async (lineId, value) => {
    try {
      await apiJson(`/api/admin/retail-stock-counts/${id}/lines/${lineId}`, { method: 'PUT', body: JSON.stringify({ physical_quantity: Number(value) || 0 }) });
      load();
    } catch (e) { addToast(friendlyFromError(e, 'save_failed')); }
  };

  const setSerials = async (lineId, value) => {
    try {
      const serials = String(value).split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      await apiJson(`/api/admin/retail-stock-counts/${id}/lines/${lineId}`, { method: 'PUT', body: JSON.stringify({ serial_numbers: serials }) });
      load();
    } catch (e) { addToast(friendlyFromError(e, 'save_failed')); }
  };

  const scanIncrement = async () => {
    if (!scanCode.trim()) return;
    try {
      const code = scanCode.trim();
      const d = await apiJson(`/api/admin/commerce/search?group=products&limit=8&q=${encodeURIComponent(code)}`);
      const match = (d.groups[0]?.results || []).find((row) => String(row.barcode) === code || String(row.sku) === code);
      if (!match) { addToast(friendlyMessage('validation', { description: `No product matches "${scanCode}".` })); return; }
      await apiJson(`/api/admin/retail-stock-counts/${id}/scan`, { method: 'POST', body: JSON.stringify({ variant_id: match.id, delta: 1 }) });
      setScanCode('');
      load();
    } catch (e) { addToast(friendlyFromError(e, 'save_failed')); }
  };

  const complete = async () => {
    setBusy(true);
    try {
      await apiJson(`/api/admin/retail-stock-counts/${id}/complete`, { method: 'POST', body: JSON.stringify({}) });
      addToast(friendlyMessage('save_success', { description: 'Ready for review.' }));
      load();
    } catch (e) { addToast(friendlyFromError(e, 'save_failed')); }
    finally { setBusy(false); }
  };

  const post = async () => {
    setBusy(true);
    try {
      await apiJson(`/api/admin/retail-stock-counts/${id}/post`, { method: 'POST', body: JSON.stringify({}) });
      addToast(friendlyMessage('save_success', { description: 'Stock count posted.' }));
      load();
    } catch (e) { addToast(friendlyFromError(e, 'save_failed')); }
    finally { setBusy(false); }
  };

  if (count === undefined) return <AdminLayout><div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div></AdminLayout>;
  if (!count) return <AdminLayout><div className="p-6 text-center text-gray-500">Stock count not found.</div></AdminLayout>;

  const showExpected = !count.blind || count.status !== 'COUNTING';
  const allCounted = count.lines.every((l) => l.physical_quantity != null);

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{count.count_number}</h1>
              <p className="text-sm text-gray-500">{count.location_name} · {count.count_type}{count.blind ? ' · blind' : ''}</p>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[count.status]}`}>{count.status}</span>
          </div>
        </div>

        {count.status === 'COUNTING' && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-2">
              <ScanLine className="w-4 h-4 text-gray-400" />
              <input
                value={scanCode} onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') scanIncrement(); }}
                placeholder="Scan or type barcode/SKU, then Enter — increments count by 1"
                className="w-full py-2 text-sm outline-none"
              />
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">Item</th>
                {showExpected && <th className="text-right px-4 py-2">Expected</th>}
                <th className="text-right px-4 py-2">Physical</th>
                {showExpected && count.status !== 'COUNTING' && <th className="text-right px-4 py-2">Variance</th>}
              </tr>
            </thead>
            <tbody>
              {count.lines.map((l) => (
                <tr key={l.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    {l.product_name ? `${l.product_name}${l.variant_name ? ` · ${l.variant_name}` : ''}` : (l.variant_name || `Variant #${l.variant_id}`)}
                    {l.batch_number && <span className="ml-1 text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{l.batch_number}</span>}
                    {l.tracking_mode === 'serial' && <div className="mt-1 text-xs text-slate-600">Serial identities
                      {count.status === 'COUNTING' ? <textarea aria-label={`Counted serials for ${l.product_name || l.variant_name}`} rows={2} defaultValue={(l.countedSerials || []).join('\n')}
                        onBlur={(e) => setSerials(l.id, e.target.value)} placeholder="Scan or paste each physical serial" className="mt-1 block w-full min-w-48 rounded border border-slate-300 p-2" />
                        : <div className="space-y-1"><p>Counted: {(l.countedSerials || []).join(', ') || 'none'}</p><p>Missing: {(l.missingSerials || []).join(', ') || 'none'}</p><p>Unexpected: {(l.unexpectedSerials || []).join(', ') || 'none'}</p>{showExpected && <p>Expected: {(l.expectedSerials || []).join(', ') || 'none'}</p>}</div>}
                    </div>}
                  </td>
                  {showExpected && <td className="px-4 py-2 text-right text-gray-500">{l.expected_quantity ?? '—'}</td>}
                  <td className="px-4 py-2 text-right">
                    {count.status === 'COUNTING' && l.tracking_mode !== 'serial' ? (
                      <input
                        type="number" min="0" defaultValue={l.physical_quantity ?? ''}
                        onBlur={(e) => setQty(l.id, e.target.value)}
                        placeholder="—"
                        className="w-20 border border-gray-300 rounded px-1.5 py-1 text-right"
                      />
                    ) : (l.physical_quantity ?? '—')}
                  </td>
                  {showExpected && count.status !== 'COUNTING' && (
                    <td className={`px-4 py-2 text-right font-medium ${Number(l.variance) > 0 ? 'text-emerald-700' : Number(l.variance) < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {l.variance != null ? l.variance : '—'}
                      {l.valueVariance != null && Math.abs(l.valueVariance) > 0.005 && <span className="ml-1 text-xs text-gray-400">({formatCurrency(l.valueVariance)})</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2">
          {count.status === 'COUNTING' && (
            <Button disabled={busy || !allCounted} onClick={complete}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Complete Counting
            </Button>
          )}
          {count.status === 'REVIEW' && canApprove && (
            <Button disabled={busy} onClick={post}>{busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Approve &amp; Post</Button>
          )}
          {count.status === 'REVIEW' && !canApprove && (
            <p className="text-sm text-gray-500">Waiting on a manager to approve and post this count.</p>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
