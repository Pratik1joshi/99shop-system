'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import { Button } from '@/components/ui/button';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';
import { useToast } from '@/components/ui/toast';
import { friendlyFromError } from '@/lib/friendly-message';

const CONDITIONS = ['RESELLABLE', 'UNOPENED', 'OPENED', 'DAMAGED', 'DEFECTIVE', 'EXPIRED', 'WRONG_ITEM', 'OTHER'];
const RISKY_CONDITIONS = new Set(['OPENED', 'DAMAGED', 'DEFECTIVE', 'EXPIRED']);
const DISPOSITIONS = ['RETURN_TO_SELLABLE', 'QUARANTINE', 'WRITE_OFF', 'NO_STOCK_RETURN'];

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function defaultLineState(line) {
  const condition = 'RESELLABLE';
  return {
    include: false,
    quantity: line.returnableQuantity,
    condition,
    disposition: 'RETURN_TO_SELLABLE',
    batch_id: line.batches.length === 1 ? line.batches[0].batch_id : '',
    reason: '',
  };
}

export default function RetailReturnPage() {
  const { id } = useParams();
  const router = useRouter();
  const prefix = usePathname().startsWith('/cashier') ? '/cashier' : '/admin';
  const { addToast } = useToast();
  const notify = (description, variant = 'default') => addToast({ description, variant, duration: variant === 'error' ? 6000 : 3000 });

  const [capabilities, setCapabilities] = useState({});
  const can = (key) => !!capabilities[key];

  const [data, setData] = useState(undefined); // { sale, lines }
  const [lineState, setLineState] = useState({}); // { [lineId]: {...} }
  const [mode, setMode] = useState('refund'); // 'refund' | 'exchange'
  const [refundMethod, setRefundMethod] = useState('cash');
  const [reason, setReason] = useState('');
  const [withoutReceipt, setWithoutReceipt] = useState(false);
  const [busy, setBusy] = useState(false);
  const attemptKey = useRef(uid());
  const returnIdRef = useRef(null);
  const [recovery, setRecovery] = useState(null);
  const searchSequence = useRef(0);

  // exchange-only: new items
  const [newLines, setNewLines] = useState([]); // [{variant_id, name, variant_name, unit_price, quantity}]
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState([]);
  const [settlementMethod, setSettlementMethod] = useState('cash');
  const [cashTendered, setCashTendered] = useState('');

  useEffect(() => {
    apiJson('/api/auth/capabilities').then((d) => setCapabilities(d.capabilities || {})).catch(() => {});
    apiJson(`/api/admin/retail-sales/${id}/returnable`).then((d) => {
      setData(d);
      const init = {};
      for (const l of d.lines) init[l.id] = defaultLineState(l);
      setLineState(init);
    }).catch((e) => { setData(null); notify(friendlyFromError(e, 'load_failed').description, 'error'); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const toggleLine = (lineId, patch) => {
    setLineState((prev) => ({ ...prev, [lineId]: { ...prev[lineId], ...patch } }));
  };

  const selectedLines = useMemo(() => {
    if (!data) return [];
    return data.lines
      .filter((l) => lineState[l.id]?.include && Number(lineState[l.id]?.quantity) > 0)
      .map((l) => ({ line: l, state: lineState[l.id] }));
  }, [data, lineState]);

  const returnLinesPayload = () => selectedLines.map(({ line, state }) => ({
    original_sale_line_id: line.id,
    quantity: Number(state.quantity),
    condition: state.condition,
    disposition: state.disposition,
    batch_id: state.batch_id || undefined,
    reason: state.reason || undefined,
  }));

  const estimatedRefund = useMemo(() => selectedLines.reduce((sum, { line, state }) => {
    const perUnit = line.allocation?.perUnitRefund || 0;
    return sum + perUnit * Number(state.quantity || 0);
  }, 0), [selectedLines]);

  const anyRisky = selectedLines.some(({ state }) => RISKY_CONDITIONS.has(state.condition) && state.disposition === 'RETURN_TO_SELLABLE');

  const searchProducts = useCallback(async (val) => {
    setProductQuery(val);
    const sequence = ++searchSequence.current;
    if (val.trim().length < 2) return setProductResults([]);
    try {
      const d = await apiJson('/api/admin/commerce/search?group=products&limit=8&q=' + encodeURIComponent(val));
      if (sequence === searchSequence.current) setProductResults((d.groups[0]?.results || []).map((v) => ({ variantId: v.id, productName: v.title, variantName: v.variant_name, sku: v.sku, price: Number(v.price) })));
    } catch { if (sequence === searchSequence.current) setProductResults([]); }
  }, []);

  const addNewLine = (row) => {
    setNewLines((prev) => {
      const existing = prev.find((l) => l.variant_id === row.variantId);
      if (existing) return prev.map((l) => l.variant_id === row.variantId ? { ...l, quantity: l.quantity + 1 } : l);
      return [...prev, { variant_id: row.variantId, name: row.productName, variant_name: row.variantName, unit_price: row.price, quantity: 1 }];
    });
    setProductQuery('');
    setProductResults([]);
  };

  const newLinesTotal = newLines.reduce((s, l) => s + Number(l.unit_price || 0) * l.quantity, 0);

  const submitReturn = async () => {
    if (!selectedLines.length) return notify('Select at least one item to return.', 'error');
    if (withoutReceipt && !reason.trim()) return notify('Enter a reason for the missing receipt.', 'error');
    if (anyRisky && !can('retail_return.non_resellable')) {
      return notify('Restocking an opened/damaged/expired item needs the "Restock opened/damaged returns" permission.', 'error');
    }
    if (refundMethod === 'store_credit' && !data.sale.customer_id) {
      return notify('Store credit refund requires an identified customer.', 'error');
    }
    setBusy(true);
    try {
      const created = returnIdRef.current ? { retail_return: { id: returnIdRef.current } } : await apiJson('/api/admin/retail-returns', {
        method: 'POST',
        body: JSON.stringify({
          original_sale_id: data.sale.id,
          customer_id: data.sale.customer_id,
          reason,
          without_receipt: withoutReceipt,
          lines: returnLinesPayload(),
        }),
      });
      const returnId = created.retail_return.id;
      returnIdRef.current = returnId;
      await apiJson(`/api/admin/retail-returns/${returnId}/post`, {
        method: 'POST',
        body: JSON.stringify({
          refund_method: refundMethod,
          allow_non_resellable: anyRisky,
          idempotency_key: attemptKey.current,
        }),
      });
      notify('Return posted.');
      router.push(`${prefix}/retail-sales-history/${data.sale.id}`);
    } catch (e) { if (e.recovery) setRecovery(e.recovery); notify(friendlyFromError(e, 'save_failed').description, 'error'); }
    finally { setBusy(false); }
  };

  const submitExchange = async () => {
    if (!selectedLines.length) return notify('Select at least one item to return.', 'error');
    if (withoutReceipt) return notify('An exchange needs the original receipt or sale reference.', 'error');
    if (!newLines.length) return notify('Add at least one replacement item.', 'error');
    if (!data.sale.customer_id) return notify('An exchange needs an identified customer on the original sale.', 'error');
    if (anyRisky && !can('retail_return.non_resellable')) {
      return notify('Restocking an opened/damaged/expired item needs the "Restock opened/damaged returns" permission.', 'error');
    }
    setBusy(true);
    try {
      const result = await apiJson('/api/admin/retail-exchanges', {
        method: 'POST',
        body: JSON.stringify({
          original_sale_id: data.sale.id,
          customer_id: data.sale.customer_id,
          reason,
          return_lines: returnLinesPayload(),
          new_sale_lines: newLines.map((l) => ({ variant_id: l.variant_id, quantity: l.quantity })),
          settlement_method: settlementMethod,
          cash_tendered: settlementMethod === 'cash' && cashTendered !== '' ? Number(cashTendered) : undefined,
          allow_non_resellable: anyRisky,
          idempotency_key: attemptKey.current,
        }),
      });
      notify('Exchange completed.');
      router.push(`${prefix}/retail-sales-history/${result.retail_exchange.new_sale_id}`);
    } catch (e) { if (e.recovery) setRecovery(e.recovery); notify(friendlyFromError(e, 'save_failed').description, 'error'); }
    finally { setBusy(false); }
  };

  if (data === undefined) {
    return <AdminLayout><div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div></AdminLayout>;
  }
  if (!data) {
    return <AdminLayout><div className="p-6 text-center text-gray-500">Could not load this sale for return.</div></AdminLayout>;
  }

  const { sale, lines } = data;

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
        {recovery && <div role="alert">Return {recovery.return_number} has posted. Store credit issued: {formatCurrency(recovery.store_credit_issued)}. Replacement did not complete. Keep this page to retry with the same exchange reference, or open Billing and use the customer?s store credit.</div>}
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Return / Exchange — {sale.sale_number || `Sale #${sale.id}`}</h1>
          <p className="text-sm text-gray-500">{sale.customer_name || 'Walk-in (no customer on this sale)'}</p>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1 max-w-xs">
            <button type="button" onClick={() => setMode('refund')} className={`rounded-md py-1.5 text-sm font-semibold ${mode === 'refund' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>Return / Refund</button>
            <button type="button" onClick={() => setMode('exchange')} className={`rounded-md py-1.5 text-sm font-semibold ${mode === 'exchange' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>Exchange</button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100">
          {lines.map((l) => {
            const st = lineState[l.id];
            if (!st) return null;
            const risky = RISKY_CONDITIONS.has(st.condition);
            return (
              <div key={l.id} className="p-4">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={st.include}
                    disabled={l.returnableQuantity <= 0}
                    onChange={(e) => toggleLine(l.id, { include: e.target.checked })}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{l.product_name_snapshot}</div>
                        <div className="text-xs text-gray-500">{[l.variant_name_snapshot, l.sku_snapshot].filter(Boolean).join(' · ')}</div>
                      </div>
                      <div className="text-sm text-gray-500">{l.returnableQuantity} of {l.quantity} returnable</div>
                    </div>

                    {st.include && (
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                        <label className="block">
                          <span className="text-xs text-gray-400">Qty</span>
                          <input
                            type="number" min="1" max={l.returnableQuantity} value={st.quantity}
                            onChange={(e) => toggleLine(l.id, { quantity: Math.min(l.returnableQuantity, Math.max(1, Number(e.target.value) || 1)) })}
                            className="w-full mt-0.5 border border-gray-300 rounded-lg px-2 py-1.5"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-400">Condition</span>
                          <select
                            value={st.condition}
                            onChange={(e) => {
                              const condition = e.target.value;
                              const disposition = RISKY_CONDITIONS.has(condition)
                                ? (condition === 'DEFECTIVE' || condition === 'DAMAGED' ? 'WRITE_OFF' : 'QUARANTINE')
                                : 'RETURN_TO_SELLABLE';
                              toggleLine(l.id, { condition, disposition });
                            }}
                            className="w-full mt-0.5 border border-gray-300 rounded-lg px-2 py-1.5"
                          >
                            {CONDITIONS.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-xs text-gray-400">Disposition</span>
                          <select
                            value={st.disposition}
                            onChange={(e) => toggleLine(l.id, { disposition: e.target.value })}
                            className="w-full mt-0.5 border border-gray-300 rounded-lg px-2 py-1.5"
                          >
                            {DISPOSITIONS.map((d) => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
                          </select>
                        </label>
                        {l.batches.length > 1 && (
                          <label className="block">
                            <span className="text-xs text-gray-400">Batch</span>
                            <select
                              value={st.batch_id}
                              onChange={(e) => toggleLine(l.id, { batch_id: e.target.value })}
                              className="w-full mt-0.5 border border-gray-300 rounded-lg px-2 py-1.5"
                            >
                              <option value="">Choose…</option>
                              {l.batches.map((b) => (
                                <option key={b.batch_id} value={b.batch_id} disabled={b.returnableQuantity <= 0}>
                                  {b.batch_number} ({b.returnableQuantity} left)
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        {risky && st.disposition === 'RETURN_TO_SELLABLE' && (
                          <div className="col-span-full text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
                            Restocking a {st.condition.toLowerCase()} item as sellable needs elevated permission and is unusual — consider Quarantine or Write-off instead.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </label>
              </div>
            );
          })}
        </div>

        {mode === 'exchange' && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Replacement items</h2>
            <div className="relative mb-3">
              <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-2">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  value={productQuery}
                  onChange={(e) => searchProducts(e.target.value)}
                  placeholder="Search replacement item…"
                  className="w-full py-1.5 text-sm outline-none"
                />
              </div>
              {productResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {productResults.map((r) => (
                    <button key={r.variantId} type="button" onClick={() => addNewLine(r)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between">
                      <span>{r.productName} {r.variantName ? `· ${r.variantName}` : ''}</span>
                      <span className="text-gray-500">{formatCurrency(r.price)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {newLines.length === 0 ? (
              <p className="text-sm text-gray-400">No replacement items yet.</p>
            ) : (
              <div className="space-y-2">
                {newLines.map((l) => (
                  <div key={l.variant_id} className="flex items-center justify-between text-sm">
                    <span>{l.name} {l.variant_name ? `· ${l.variant_name}` : ''}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min="1" value={l.quantity}
                        onChange={(e) => setNewLines((prev) => prev.map((x) => x.variant_id === l.variant_id ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))}
                        className="w-16 border border-gray-300 rounded px-1.5 py-1"
                      />
                      <span className="w-20 text-right">{formatCurrency(l.unit_price * l.quantity)}</span>
                      <button type="button" onClick={() => setNewLines((prev) => prev.filter((x) => x.variant_id !== l.variant_id))} className="text-gray-400 hover:text-red-500">×</button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between font-semibold pt-2 border-t border-gray-100">
                  <span>New items total</span><span>{formatCurrency(newLinesTotal)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
          {mode === 'refund' && can('retail_return.without_receipt') && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={withoutReceipt} onChange={(e) => setWithoutReceipt(e.target.checked)} /><span>Customer does not have the receipt. The original sale has been identified above; record a reason for this exception.</span></label>}
          <label className="block text-sm">
            <span className="text-gray-500">Reason {withoutReceipt ? '(required)' : '(optional)'}</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
          </label>

          {mode === 'refund' ? (
            <>
              <div className="flex justify-between text-base font-bold">
                <span>Estimated refund</span><span>{formatCurrency(estimatedRefund)}</span>
              </div>
              <label className="block text-sm">
                <span className="text-gray-500">Refund method</span>
                <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5">
                  <option value="cash">Cash</option>
                  <option value="online">Digital / Bank</option>
                  {sale.customer_id && <option value="store_credit">Store credit</option>}
                  <option value="ar_reduction">Reduce customer credit (AR)</option>
                </select>
              </label>
              <Button className="w-full" disabled={busy} onClick={submitReturn}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Post Return
              </Button>
            </>
          ) : (
            <>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Return credit (estimated)</span><span>{formatCurrency(estimatedRefund)}</span>
              </div>
              <div className="flex justify-between text-base font-bold">
                <span>Difference to settle</span><span>{formatCurrency(Math.max(0, newLinesTotal - estimatedRefund))}</span>
              </div>
              {newLinesTotal > estimatedRefund && (
                <label className="block text-sm">
                  <span className="text-gray-500">Settle difference with</span>
                  <select value={settlementMethod} onChange={(e) => setSettlementMethod(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5">
                    <option value="cash">Cash</option>
                    <option value="online">Digital / Bank</option>
                    {can('retail_sale.credit') && <option value="credit">Credit</option>}
                  </select>
                </label>
              )}
              {newLinesTotal > estimatedRefund && settlementMethod === 'cash' && <label className="block text-sm"><span className="text-gray-500">Cash tendered for difference</span><input type="number" min="0" step="0.01" value={cashTendered} onChange={(e) => setCashTendered(e.target.value)} placeholder={String(Math.max(0, newLinesTotal - estimatedRefund))} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" /></label>}
              <Button className="w-full" disabled={busy} onClick={submitExchange}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Complete Exchange
              </Button>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
