'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import { Button } from '@/components/ui/button';
import { apiJson } from '@/lib/authed-fetch';
import { useToast } from '@/components/ui/toast';
import { friendlyFromError, friendlyMessage } from '@/lib/friendly-message';

const STATUS_BADGE = {
  DRAFT: 'bg-gray-100 text-gray-600', DISPATCHED: 'bg-amber-100 text-amber-800',
  RECEIVED: 'bg-emerald-100 text-emerald-800', CANCELLED: 'bg-red-100 text-red-700',
};

export default function RetailTransferDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { addToast } = useToast();
  const [transfer, setTransfer] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [receiveQty, setReceiveQty] = useState({});
  const [receiveSerials, setReceiveSerials] = useState({});
  const [discrepancy, setDiscrepancy] = useState({});
  const [cancelReason, setCancelReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);

  const load = useCallback(() => {
    apiJson(`/api/admin/retail-transfers/${id}`).then((d) => {
      setTransfer(d.retail_transfer);
      const q = {};
      const serials = {};
      for (const l of d.retail_transfer.lines) q[l.id] = l.dispatched_quantity;
      for (const l of d.retail_transfer.lines) serials[l.id] = (l.serials || []).map((row) => row.serial_number).join(' ');
      setReceiveQty(q);
      setReceiveSerials(serials);
    }).catch(() => setTransfer(null));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const dispatch = async () => {
    setBusy(true);
    try {
      await apiJson(`/api/admin/retail-transfers/${id}/dispatch`, { method: 'POST', body: JSON.stringify({}) });
      addToast(friendlyMessage('save_success', { description: 'Transfer dispatched.' }));
      load();
    } catch (e) { addToast(friendlyFromError(e, 'save_failed')); }
    finally { setBusy(false); }
  };

  const receive = async () => {
    setBusy(true);
    try {
      const lines = transfer.lines.map((l) => {
        const qty = Number(receiveQty[l.id]);
        const short = qty < Number(l.dispatched_quantity) - 0.0005;
        return { lineId: l.id, receivedQuantity: qty, discrepancyReason: short ? (discrepancy[l.id] || '') : undefined,
          discrepancyDisposition: short ? 'PENDING_INVESTIGATION' : undefined,
          serialNumbers: l.tracking_mode === 'serial' ? String(receiveSerials[l.id] || '').split(/[\s,]+/).filter(Boolean) : undefined };
      });
      await apiJson(`/api/admin/retail-transfers/${id}/receive`, { method: 'POST', body: JSON.stringify({ lines }) });
      addToast(friendlyMessage('save_success', { description: 'Transfer received.' }));
      load();
    } catch (e) { addToast(friendlyFromError(e, 'save_failed')); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await apiJson(`/api/admin/retail-transfers/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: cancelReason }) });
      addToast(friendlyMessage('save_success', { description: 'Transfer cancelled.' }));
      setShowCancel(false);
      load();
    } catch (e) { addToast(friendlyFromError(e, 'save_failed')); }
    finally { setBusy(false); }
  };

  if (transfer === undefined) return <AdminLayout><div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div></AdminLayout>;
  if (!transfer) return <AdminLayout><div className="p-6 text-center text-gray-500">Transfer not found.</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{transfer.transfer_number}</h1>
              <p className="text-sm text-gray-500">{transfer.source_name} → {transfer.destination_name}</p>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[transfer.status]}`}>{transfer.status}</span>
          </div>
          {transfer.notes && <p className="mt-2 text-sm text-gray-600">{transfer.notes}</p>}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">Item</th>
                <th className="text-right px-4 py-2">Requested</th>
                <th className="text-right px-4 py-2">Dispatched</th>
                {transfer.status === 'DISPATCHED' && <th className="text-right px-4 py-2">Receive Qty</th>}
                {transfer.status === 'RECEIVED' && <th className="text-right px-4 py-2">Received</th>}
              </tr>
            </thead>
            <tbody>
              {transfer.lines.map((l) => (
                <tr key={l.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">
                    {l.product_name ? `${l.product_name}${l.variant_name ? ` · ${l.variant_name}` : ''}` : (l.variant_name || `Variant #${l.variant_id}`)}
                    {l.batch_number && <span className="ml-1 text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{l.batch_number}</span>}
                    {l.tracking_mode === 'serial' && <div className="text-xs text-slate-500">Dispatched: {(l.serials || []).map((serial) => serial.serial_number).join(', ')}</div>}
                    {l.tracking_mode === 'serial' && transfer.status === 'DISPATCHED' && <input aria-label={`Received serials for ${l.product_name || l.variant_name}`} className="mt-1 w-full rounded border border-slate-300 p-1.5 text-xs" value={receiveSerials[l.id] || ''} onChange={(e) => setReceiveSerials((current) => ({ ...current, [l.id]: e.target.value }))} />}
                  </td>
                  <td className="px-4 py-2 text-right">{l.requested_quantity}</td>
                  <td className="px-4 py-2 text-right">{l.dispatched_quantity}</td>
                  {transfer.status === 'DISPATCHED' && (
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number" min="0" max={l.dispatched_quantity} value={receiveQty[l.id] ?? l.dispatched_quantity}
                        onChange={(e) => setReceiveQty((prev) => ({ ...prev, [l.id]: e.target.value }))}
                        className="w-20 border border-gray-300 rounded px-1.5 py-1 text-right"
                      />
                    </td>
                  )}
                  {transfer.status === 'RECEIVED' && <td className="px-4 py-2 text-right">{l.received_quantity}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {transfer.status === 'DISPATCHED' && transfer.lines.some((l) => Number(receiveQty[l.id]) < Number(l.dispatched_quantity) - 0.0005) && (
            <div className="p-4 border-t border-gray-100 space-y-2 bg-amber-50">
              <p className="text-xs text-amber-800">A short receive needs a reason per line:</p>
              {transfer.lines.filter((l) => Number(receiveQty[l.id]) < Number(l.dispatched_quantity) - 0.0005).map((l) => (
                <input
                  key={l.id} placeholder={`Reason for ${l.variant_name || l.id} shortfall`} value={discrepancy[l.id] || ''}
                  onChange={(e) => setDiscrepancy((prev) => ({ ...prev, [l.id]: e.target.value }))}
                  className="w-full border border-amber-300 rounded-lg px-2 py-1.5 text-sm"
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          {transfer.status === 'DRAFT' && (
            <>
              <Button disabled={busy} onClick={dispatch}>{busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Dispatch</Button>
              <Button variant="outline" disabled={busy} onClick={() => setShowCancel(true)}>Cancel</Button>
            </>
          )}
          {transfer.status === 'DISPATCHED' && (
            <>
              <Button disabled={busy} onClick={receive}>{busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Receive</Button>
              <Button variant="outline" disabled={busy} onClick={() => setShowCancel(true)}>Reverse Dispatch</Button>
            </>
          )}
        </div>
      </div>

      {showCancel && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <h3 className="mb-1 text-lg font-bold text-gray-900">{transfer.status === 'DISPATCHED' ? 'Reverse dispatch' : 'Cancel transfer'}</h3>
            {transfer.status === 'DISPATCHED' && (
              <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason (required)" className="w-full mt-3 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            )}
            <div className="mt-4 flex gap-3">
              <button disabled={busy} onClick={cancel} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">Confirm</button>
              <button type="button" onClick={() => setShowCancel(false)} className="flex-1 rounded-lg bg-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-300">Back</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
