'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/admin/admin-layout';
import { apiJson } from '@/lib/authed-fetch';
import { useCapabilities } from '@/lib/use-capabilities';

const money = (value) => `Rs ${Number(value || 0).toFixed(2)}`;

export default function PurchaseReturnsPage() {
  const { can } = useCapabilities();
  const [receipts, setReceipts] = useState([]);
  const [returns, setReturns] = useState([]);
  const [receiptId, setReceiptId] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [selected, setSelected] = useState({});
  const [reason, setReason] = useState('');
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [posted, setPosted] = useState(null);

  const refresh = useCallback(async () => {
    const [r, p] = await Promise.all([
      apiJson('/api/admin/retail-goods-receipts?status=POSTED'),
      apiJson('/api/admin/retail-purchase-returns'),
    ]);
    setReceipts(r.goods_receipts || []);
    setReturns(p.purchase_returns || []);
  }, []);
  useEffect(() => { refresh().catch((e) => setError(e.message)); }, [refresh]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const value = new URLSearchParams(window.location.search).get('receipt');
      if (value) setReceiptId(value);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!receiptId) return;
    let active = true;
    apiJson(`/api/admin/retail-goods-receipts/${receiptId}`)
      .then((data) => { if (active) { setReceipt(data.goods_receipt); setSelected({}); setReview(false); } })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [receiptId]);

  const update = (id, patch) => {
    setReview(false);
    setSelected((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  };
  const lines = useMemo(() => (receipt?.lines || []).filter((line) => Number(selected[line.id]?.quantity) > 0).map((line) => ({
    ...line, requested: Number(selected[line.id].quantity), batchId: selected[line.id].batchId,
    serials: String(selected[line.id].serials || '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
  })), [receipt, selected]);
  const credit = lines.reduce((sum, line) => sum + line.requested * Number(line.unit_cost || 0), 0);
  const quantity = lines.reduce((sum, line) => sum + line.requested, 0);
  const validate = () => {
    if (!receipt || receipt.status !== 'POSTED') return 'Select a posted goods receipt.';
    if (!reason.trim()) return 'Enter a reason for the supplier return.';
    if (!lines.length) return 'Select at least one item and quantity.';
    for (const line of lines) {
      if (line.requested > Number(line.stock_quantity) - Number(line.returned_quantity || 0) + 0.0005) return `${line.product_name}: quantity exceeds the receipt balance.`;
      if (line.tracking_mode === 'batch' && !line.batchId) return `${line.product_name}: select the original batch.`;
      if (line.tracking_mode === 'serial' && (line.serials.length !== line.requested || new Set(line.serials).size !== line.serials.length)) return `${line.product_name}: enter one distinct serial for each unit.`;
    }
    return '';
  };
  const submit = async () => {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try {
      const created = await apiJson('/api/admin/retail-purchase-returns', { method: 'POST', body: JSON.stringify({
        supplier_id: receipt.supplier_id, goods_receipt_id: receipt.id, reason: reason.trim(), refund_method: 'credit_note',
        lines: lines.map((line) => ({ goods_receipt_line_id: line.id, variant_id: line.variant_id,
          quantity: line.requested, batch_id: line.batchId || null, serial_numbers: line.serials })),
      }) });
      const result = await apiJson(`/api/admin/retail-purchase-returns/${created.purchase_return.id}/post`, { method: 'POST' });
      setPosted(result.purchase_return); setReview(false); setSelected({});
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return <AdminLayout><div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <header><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Purchasing</p><h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Supplier returns</h1><p className="text-sm text-slate-600">Return stock against its original posted receipt and reduce the supplier payable.</p></header>
    {error && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {posted && <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{posted.return_number} posted. Inventory and supplier balance have been updated. <Link className="underline" href="/admin/retail-inventory-movements">View movements</Link></div>}
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" aria-label="Create supplier return">
      <label className="block text-sm font-medium">Original posted receipt<select className="mt-1 w-full rounded-lg border border-slate-300 p-2" value={receiptId} onChange={(e) => { setReceiptId(e.target.value); setReceipt(null); setPosted(null); }}><option value="">Select receipt</option>{receipts.map((r) => <option key={r.id} value={r.id}>{r.grn_number} · {r.supplier_name} · {r.receipt_date}</option>)}</select></label>
      {receipt && <><p className="text-sm text-slate-600">Receipt {receipt.grn_number} · {receipt.invoice_number ? `Invoice ${receipt.invoice_number} · ` : ''}{receipt.receipt_date}</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-2">Received item</th><th className="p-2">Received</th><th className="p-2">Returned</th><th className="p-2">Return quantity</th><th className="p-2">Identity</th></tr></thead><tbody>{receipt.lines.map((line) => <tr key={line.id} className="border-t border-slate-100"><td className="p-2"><strong>{line.product_name || line.variant_name}</strong><span className="block text-xs text-slate-500">{line.variant_name} · {line.tracking_mode}</span></td><td className="p-2 tabular-nums">{line.stock_quantity}</td><td className="p-2 tabular-nums">{line.returned_quantity || 0}</td><td className="p-2"><input aria-label={`Return quantity for ${line.product_name || line.variant_name}`} type="number" min="0" max={Number(line.stock_quantity) - Number(line.returned_quantity || 0)} step="1" className="w-24 rounded border border-slate-300 p-2" value={selected[line.id]?.quantity || ''} onChange={(e) => update(line.id, { quantity: e.target.value })} /></td><td className="p-2">{line.tracking_mode === 'batch' ? <select aria-label={`Batch for ${line.product_name || line.variant_name}`} className="w-full rounded border border-slate-300 p-2" value={selected[line.id]?.batchId || ''} onChange={(e) => update(line.id, { batchId: e.target.value })}><option value="">Select original batch</option>{(line.inventory_batches || []).map((b) => <option value={b.id} key={b.id}>{b.batch_number} · on hand {b.quantity_on_hand || 0}</option>)}</select> : line.tracking_mode === 'serial' ? <div><input aria-label={`Serial numbers for ${line.product_name || line.variant_name}`} className="w-full rounded border border-slate-300 p-2" placeholder="Scan or paste serials, separated by spaces" value={selected[line.id]?.serials || ''} onChange={(e) => update(line.id, { serials: e.target.value })} /><small>{String(selected[line.id]?.serials || '').split(/[\s,]+/).filter(Boolean).length} / {selected[line.id]?.quantity || 0} captured · Available: {(line.available_serial_numbers || []).join(', ') || 'none'}</small></div> : '—'}</td></tr>)}</tbody></table></div>
        <label className="block text-sm font-medium">Reason<textarea className="mt-1 w-full rounded-lg border border-slate-300 p-2" rows={2} value={reason} onChange={(e) => { setReason(e.target.value); setReview(false); }} placeholder="Defect, damage, wrong item…" /></label>
        {!review ? <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white" onClick={() => { const problem = validate(); if (problem) setError(problem); else { setError(''); setReview(true); } }}>Review return</button> : <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><h2 className="font-semibold">Review effect</h2><p>{quantity} unit(s) leave inventory. The supplier payable decreases by {can('retail_purchasing.view_cost') ? money(credit) : 'the receipt credit amount'}.</p><p>Any difference between supplier credit and current inventory carrying value posts to purchase price variance.</p><div className="flex gap-2"><button className="rounded-lg border border-slate-300 bg-white px-4 py-2" onClick={() => setReview(false)}>Edit</button><button disabled={busy} className="rounded-lg bg-slate-950 px-4 py-2 text-white disabled:opacity-50" onClick={submit}>{busy ? 'Posting…' : 'Post supplier return'}</button></div></div>}
      </>}
    </section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><h2 className="p-4 text-lg font-semibold">Recent supplier returns</h2><div className="overflow-x-auto"><table className="w-full min-w-[550px] text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Return</th><th className="p-3">Supplier</th><th className="p-3">Date</th><th className="p-3">Status</th><th className="p-3">Original receipt</th></tr></thead><tbody>{returns.map((r) => <tr key={r.id} className="border-t border-slate-100"><td className="p-3 font-medium">{r.return_number}</td><td className="p-3">{r.supplier_name}</td><td className="p-3">{r.return_date}</td><td className="p-3">{r.status}</td><td className="p-3"><button className="text-blue-700 underline" onClick={() => setReceiptId(String(r.goods_receipt_id))}>Receipt #{r.goods_receipt_id}</button></td></tr>)}</tbody></table></div></section>
  </div></AdminLayout>;
}
