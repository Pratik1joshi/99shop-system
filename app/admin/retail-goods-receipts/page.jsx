'use client';

/** Record a supplier delivery and its resulting purchase, stock and payable. */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ScanLine, Search, Trash2, Loader2, CheckCircle2, AlertTriangle, Package, ShoppingCart, Truck, Plus } from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';
import ProductVariantPicker from '@/components/commerce/product-variant-picker';
import { useCapabilities } from '@/lib/use-capabilities';

export default function RetailGoodsReceiptsPage() {
  const { addToast } = useToast();
  const { can } = useCapabilities();
  const notify = useCallback((description, variant = 'default') => addToast({ description, variant, duration: variant === 'error' ? 5000 : 3000 }), [addToast]);

  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [scanCode, setScanCode] = useState('');
  const scanRef = useRef(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('credit');
  const [receipts, setReceipts] = useState([]);
  const [view, setView] = useState('history');
  const [historySearch, setHistorySearch] = useState('');
  const [historySupplier, setHistorySupplier] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');

  const [lines, setLines] = useState([]); // { local_id, variant_id, name, variant_name, tracking_mode, purchase_order_line_id, quantity, unit_cost, batches: [{batch_number, expiry_date, quantity}] }
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState(null);
  const [review, setReview] = useState(false);

  const loadReceipts = useCallback(() => {
    const params = new URLSearchParams({ page: String(historyPage) });
    if (historySearch.trim()) params.set('q', historySearch.trim());
    if (historySupplier) params.set('supplier_id', historySupplier);
    if (historyStatus) params.set('status', historyStatus);
    if (historyFrom) params.set('from', historyFrom);
    if (historyTo) params.set('to', historyTo);
    setHistoryLoading(true);
    setHistoryError('');
    apiJson(`/api/admin/retail-goods-receipts?${params}`)
      .then((d) => { setReceipts(d.goods_receipts || []); setHistoryTotal(d.pagination?.total || 0); })
      .catch((error) => { setHistoryError(error?.error || error?.message || 'Could not load purchase history.'); setReceipts([]); })
      .finally(() => setHistoryLoading(false));
  }, [historyPage, historySearch, historySupplier, historyStatus, historyFrom, historyTo]);

  useEffect(() => {
    apiJson('/api/admin/suppliers?page_size=200').then((d) => setSuppliers(d.suppliers || [])).catch(() => {});
    loadReceipts();
  }, [loadReceipts]);

  useEffect(() => {
    if (!supplierId) { setPurchaseOrders([]); return; }
    apiJson(`/api/admin/retail-purchase-orders?supplier_id=${supplierId}&page_size=100`)
      .then((d) => setPurchaseOrders((d.purchase_orders || []).filter((po) => ['APPROVED','PARTIALLY_RECEIVED'].includes(po.status))))
      .catch(() => setPurchaseOrders([]));
  }, [supplierId]);

  const [poDetail, setPoDetail] = useState(null);
  useEffect(() => {
    const poId = new URLSearchParams(window.location.search).get('po');
    if (!poId) return;
    setView('form');
    apiJson(`/api/admin/retail-purchase-orders/${poId}`).then((result) => {
      setSupplierId(String(result.purchase_order.supplier_id));
      setPurchaseOrderId(String(result.purchase_order.id));
    }).catch(() => notify('Could not load the selected purchase order.', 'error'));
  }, [notify]);
  useEffect(() => {
    if (!purchaseOrderId) { setPoDetail(null); return; }
    let active = true;
    apiJson(`/api/admin/retail-purchase-orders/${purchaseOrderId}`).then((d) => {
      if (!active) return;
      const order = d.purchase_order;
      setPoDetail(order);
      setLines(order.lines.filter((line) => Number(line.ordered_quantity) > Number(line.quantity_received)).map((line) => {
        const remaining = Number(line.ordered_quantity) - Number(line.quantity_received);
        return { local_id: `po-${line.id}`, variant_id: line.variant_id, name: line.product_name, variant_name: line.variant_name,
          tracking_mode: line.tracking_mode || 'none', purchase_order_line_id: line.id, quantity: remaining,
          unit_cost: Number(line.unit_cost), batches: line.tracking_mode === 'batch' ? [{ batch_number: '', expiry_date: '', quantity: remaining }] : [], serial_numbers: [] };
      }));
      setReview(false);
    }).catch(() => { if (active) setPoDetail(null); });
    return () => { active = false; };
  }, [purchaseOrderId]);

  const asMatch = (row) => ({ variantId: row.id, name: row.title, variantName: row.variant_name, sku: row.sku, barcode: row.barcode, trackingMode: row.tracking_mode || 'none' });

  const addLine = useCallback((match, matchedPoLine) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.variant_id === match.variantId);
      if (existing?.purchase_order_line_id) return prev;
      if (existing && existing.tracking_mode !== 'batch') {
        return prev.map((l) => l.local_id === existing.local_id ? { ...l, quantity: Number(l.quantity) + 1 } : l);
      }
      if (existing) return prev; // batch-tracked: let the cashier add batch rows manually below instead of guessing a repeat
      const remaining = matchedPoLine ? Math.max(0, Number(matchedPoLine.ordered_quantity) - Number(matchedPoLine.quantity_received)) : 1;
      return [...prev, {
        local_id: `${Date.now()}-${Math.random()}`, variant_id: match.variantId, name: match.name, variant_name: match.variantName,
        tracking_mode: match.trackingMode, purchase_order_line_id: matchedPoLine?.id || null,
        quantity: matchedPoLine ? remaining : 1, unit_cost: matchedPoLine ? Number(matchedPoLine.unit_cost) : 0,
        batches: match.trackingMode === 'batch' ? [{ batch_number: '', expiry_date: '', quantity: matchedPoLine ? remaining : 1 }] : [],
        serial_numbers: [],
      }];
    });
  }, []);

  const handleScan = useCallback(async (code) => {
    let match;
    try {
      const result = await apiJson(`/api/admin/commerce/search?group=products&limit=8&q=${encodeURIComponent(code)}`);
      const row = (result.groups[0]?.results || []).find((candidate) => String(candidate.barcode) === code || String(candidate.sku) === code);
      if (row) match = asMatch(row);
    } catch { /* Keep the scan field available for retry. */ }
    if (!match) return notify(`No exact product found for barcode or SKU ${code}.`, 'error');
    const matchedPoLine = poDetail?.lines?.find((l) => l.variant_id === match.variantId);
    if (poDetail && !matchedPoLine) {
      notify(`"${match.name}" is not on the selected purchase order â€” added anyway, double-check it.`, 'warning');
    }
    addLine(match, matchedPoLine);
    setReview(false);
  }, [poDetail, addLine, notify]);

  const updateLine = (localId, patch) => { setReview(false); setLines((prev) => prev.map((l) => l.local_id === localId ? { ...l, ...patch } : l)); };
  const updateBatch = (localId, idx, patch) => { setReview(false); setLines((prev) => prev.map((l) => l.local_id === localId ? { ...l, batches: l.batches.map((b, i) => i === idx ? { ...b, ...patch } : b) } : l)); };
  const addBatchRow = (localId) => { setReview(false); setLines((prev) => prev.map((l) => l.local_id === localId ? { ...l, batches: [...l.batches, { batch_number: '', expiry_date: '', quantity: 0 }] } : l)); };
  const removeLine = (localId) => { setReview(false); setLines((prev) => prev.filter((l) => l.local_id !== localId)); };

  const addSerial = (line, raw) => {
    const serial = String(raw || '').trim();
    if (!serial) return;
    if (line.serial_numbers.includes(serial)) return notify(`Serial ${serial} is already captured.`, 'warning');
    updateLine(line.local_id, { serial_numbers: [...line.serial_numbers, serial], serial_entry: '' });
  };

  const reviewReceipt = () => {
    if (!supplierId) return notify('Choose a supplier.', 'warning');
    if (!lines.length) return notify('Add at least one product.', 'warning');
    for (const line of lines) {
      const received = line.tracking_mode === 'batch' ? line.batches.reduce((sum, batch) => sum + Number(batch.quantity || 0), 0) : Number(line.quantity);
      if (!Number.isFinite(received) || received <= 0) return notify(`Enter a quantity greater than zero for ${line.name}.`, 'warning');
      if (line.tracking_mode === 'serial' && line.serial_numbers.length !== Number(line.quantity)) return notify(`Capture ${line.quantity} serials for ${line.name} before reviewing.`, 'warning');
      if (line.tracking_mode === 'batch' && (line.batches.some((batch) => Number(batch.quantity) > 0 && !batch.batch_number.trim()) || !line.batches.some((batch) => Number(batch.quantity) > 0))) return notify(`Complete batch identity and quantity for ${line.name}.`, 'warning');
    }
    setReview(true);
  };

  const submit = useCallback(async () => {
    if (!supplierId) return notify('Choose a supplier.', 'warning');
    if (!lines.length) return notify('Scan or add at least one line.', 'warning');
    setBusy(true);
    try {
      const payload = {
        supplierId: Number(supplierId),
        purchaseOrderId: purchaseOrderId ? Number(purchaseOrderId) : null,
        invoiceNumber: invoiceNumber.trim() || null,
        invoiceDate: invoiceDate || null,
        paymentMethod,
        lines: lines.map((l) => ({
          purchaseOrderLineId: l.purchase_order_line_id,
          variantId: l.variant_id,
          quantityReceived: l.tracking_mode === 'batch' ? l.batches.reduce((s, b) => s + Number(b.quantity || 0), 0) : Number(l.quantity),
          unitCost: Number(l.unit_cost),
          batches: l.tracking_mode === 'batch' ? l.batches.filter((b) => Number(b.quantity) > 0).map((b) => ({ batchNumber: b.batch_number, expiryDate: b.expiry_date || null, quantity: Number(b.quantity) })) : undefined,
          serialNumbers: l.tracking_mode === 'serial' ? l.serial_numbers : undefined,
        })),
      };
      const created = await apiJson('/api/admin/retail-goods-receipts', { method: 'POST', body: JSON.stringify(payload) });
      const grnId = created.goods_receipt.id;
      const result = await apiJson(`/api/admin/retail-goods-receipts/${grnId}/post`, { method: 'POST', body: JSON.stringify({}) });
      setPosted(result.goods_receipt);
      setLines([]);
      setPurchaseOrderId('');
      setPoDetail(null);
      setReview(false);
      setInvoiceNumber('');
      setInvoiceDate('');
      loadReceipts();
      setView('history');
      notify(`${result.goods_receipt.grn_number} posted.`, 'success');
    } catch (e) {
      notify(e.error || 'Failed to post goods receipt.', 'error');
    } finally {
      setBusy(false);
    }
  }, [supplierId, purchaseOrderId, invoiceNumber, invoiceDate, paymentMethod, lines, notify, loadReceipts]);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl space-y-5 bg-slate-50 p-4 sm:p-6 lg:p-8">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Inventory / Purchases</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Purchases</h1><p className="mt-1 text-sm text-slate-600">Record a supplier delivery. The purchase, stock and payment record are saved together.</p></div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/retail-purchase-orders" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">View purchase orders</Link>
            {view === 'history' ? <Button onClick={() => { setPosted(null); setView('form'); }}><Plus className="mr-2 h-4 w-4" /> New purchase</Button> : <Button variant="outline" onClick={() => setView('history')}>Purchase history</Button>}
          </div>
        </header>

        {posted && view === 'history' && <div role="status" className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"><CheckCircle2 className="h-5 w-5" /> {posted.grn_number} posted — stock and accounting updated.</div>}

        {view === 'history' && <section className="rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Purchase history">
          <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-slate-500" /><h2 className="text-lg font-semibold text-slate-900">Purchase history</h2></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm font-medium text-slate-700">Search<input value={historySearch} onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }} placeholder="Receipt, invoice or supplier" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
              <label className="text-sm font-medium text-slate-700">Supplier<select value={historySupplier} onChange={(e) => { setHistorySupplier(e.target.value); setHistoryPage(1); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">All suppliers</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
              <label className="text-sm font-medium text-slate-700">Status<select value={historyStatus} onChange={(e) => { setHistoryStatus(e.target.value); setHistoryPage(1); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">All statuses</option><option value="POSTED">Posted</option><option value="DRAFT">Draft</option><option value="VOIDED">Voided</option></select></label>
              <label className="text-sm font-medium text-slate-700">From<input type="date" value={historyFrom} onChange={(e) => { setHistoryFrom(e.target.value); setHistoryPage(1); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
              <label className="text-sm font-medium text-slate-700">To<input type="date" value={historyTo} onChange={(e) => { setHistoryTo(e.target.value); setHistoryPage(1); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
            </div>
          </div>
          {historyLoading ? <p className="px-4 py-8 text-center text-sm text-slate-500">Loading purchases...</p> : historyError ? <p role="alert" className="px-4 py-8 text-center text-sm text-red-700">{historyError} <button type="button" onClick={loadReceipts} className="font-semibold underline">Retry</button></p> : receipts.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">No purchases match these filters.</p> : <div className="divide-y divide-slate-100">
            {receipts.map((receipt) => <div key={receipt.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-center">
              <div><p className="font-semibold text-slate-900">{receipt.grn_number}</p><p className="text-xs text-slate-500">{String(receipt.receipt_date || '').slice(0, 10)}{receipt.invoice_number ? ` Â· Invoice ${receipt.invoice_number}` : ''}</p></div>
              <p className="text-slate-700">{receipt.supplier_name || 'Unknown supplier'}</p>
              <p className="text-slate-500">{receipt.line_count} line{Number(receipt.line_count) === 1 ? '' : 's'} Â· {receipt.payment_method || 'credit'}</p>
              <div className="flex items-center gap-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${receipt.status === 'POSTED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{receipt.status}</span>{receipt.status === 'POSTED' && <Link className="text-xs font-medium text-blue-700 underline" href={`/admin/retail-purchase-returns?receipt=${receipt.id}`}>Return items</Link>}</div>
            </div>)}
          </div>}
          {historyTotal > 25 && <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm"><span>Page {historyPage} of {Math.ceil(historyTotal / 25)} Â· {historyTotal} purchases</span><div className="flex gap-2"><Button variant="outline" disabled={historyPage <= 1} onClick={() => setHistoryPage((page) => page - 1)}>Previous</Button><Button variant="outline" disabled={historyPage * 25 >= historyTotal} onClick={() => setHistoryPage((page) => page + 1)}>Next</Button></div></div>}
        </section>}

        {view === 'form' && <>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">1</span><div><h2 className="font-semibold text-slate-900">Supplier and delivery</h2><p className="text-sm text-slate-500">Select an approved order, or record a purchase without one.</p></div></div>
          <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="receipt-supplier" className="text-sm font-medium text-slate-700">Supplier</label>
            <select id="receipt-supplier" value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setPurchaseOrderId(''); setLines([]); setReview(false); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="">Select supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-500">Missing a supplier? <Link href="/admin/retail-suppliers" className="font-semibold text-blue-700 underline">Add one first</Link>.</p>
          </div>
          <div>
            <label htmlFor="receipt-po" className="text-sm font-medium text-slate-700">Purchase order (optional)</label>
            <select id="receipt-po" value={purchaseOrderId} onChange={(e) => { setPurchaseOrderId(e.target.value); setLines([]); setReview(false); }} disabled={!supplierId} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="">Purchase without an order</option>
              {purchaseOrders.map((po) => <option key={po.id} value={po.id}>{po.po_number}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Supplier invoice</label>
            <input value={invoiceNumber} onChange={(e) => { setInvoiceNumber(e.target.value); setReview(false); }} placeholder="Invoice or reference number" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Invoice date</label>
            <input type="date" value={invoiceDate} onChange={(e) => { setInvoiceDate(e.target.value); setReview(false); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">How was this paid?</label>
            <select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setReview(false); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
              <option value="credit">On credit</option>
              <option value="cash">Cash</option>
              <option value="online">Online / bank</option>
              <option value="business_funding">Business funding</option>
              <option value="owner_pocket">Owner pocket</option>
            </select>
          </div>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">2</span><div><h2 className="font-semibold text-slate-900">Products delivered</h2><p className="text-sm text-slate-500">{purchaseOrderId ? 'Items remaining on the order appear below. Check what actually arrived.' : 'Search for a product variant or scan its barcode.'}</p></div></div>
          <div className="grid gap-4 md:grid-cols-2">
          <div><label className="flex items-center gap-2 text-sm font-medium text-slate-700"><ScanLine className="h-4 w-4" /> Scan barcode or SKU</label>
          <input
            ref={scanRef}
            value={scanCode}
            onChange={(e) => setScanCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && scanCode.trim()) { handleScan(scanCode.trim()); setScanCode(''); } }}
            placeholder="Scan or type, then press Enter"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-emerald-500"
          />
          </div>
          <div><label className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-700"><Search className="h-4 w-4" /> Search products</label>
            <ProductVariantPicker onPick={(variant) => { addLine(asMatch(variant), poDetail?.lines?.find((line) => line.variant_id === variant.id)); setReview(false); }} />
          </div></div>
          {!lines.length && <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">No products added yet. Choose a purchase order or search for what arrived.</p>}
        </section>

        {lines.length > 0 && <section className="space-y-3"><div className="flex items-center gap-2"><Truck className="h-5 w-5 text-emerald-700" aria-hidden /><h2 className="font-semibold text-slate-900">Check quantities and cost</h2><span className="text-sm text-slate-500">{lines.length} variant{lines.length === 1 ? '' : 's'}</span></div>
          {lines.map((l) => (
            <div key={l.local_id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{l.name}</div><p className="text-sm text-slate-500">{l.variant_name && l.variant_name !== 'Standard' ? l.variant_name : 'Standard variant'}</p>
                  {!l.purchase_order_line_id && purchaseOrderId && (
                    <div className="flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="w-3 h-3" /> Not on the selected PO</div>
                  )}
                </div>
                <button type="button" aria-label={`Remove ${l.name} ${l.variant_name || ''}`} onClick={() => removeLine(l.local_id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
              {l.purchase_order_line_id && (() => { const ordered = poDetail?.lines?.find((row) => Number(row.id) === Number(l.purchase_order_line_id)); return ordered ? <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-4"><span>Ordered <strong className="block text-sm text-slate-900">{ordered.ordered_quantity}</strong></span><span>Already delivered <strong className="block text-sm text-slate-900">{ordered.quantity_received}</strong></span><span>Remaining <strong className="block text-sm text-slate-900">{Number(ordered.ordered_quantity) - Number(ordered.quantity_received)}</strong></span><span>Delivering now <strong className="block text-sm text-slate-900">{l.tracking_mode === 'batch' ? l.batches.reduce((sum, batch) => sum + Number(batch.quantity || 0), 0) : l.quantity}</strong></span></div> : null; })()}

              {l.tracking_mode === 'batch' ? (
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-1 text-sm text-slate-600"><Package className="h-4 w-4" /> Enter batch and expiry for each delivered lot</div>
                  {l.batches.map((b, idx) => (
                    <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_11rem_7rem]">
                      <label className="text-xs font-medium text-slate-600">Batch number<input placeholder="Batch #" value={b.batch_number} onChange={(e) => updateBatch(l.local_id, idx, { batch_number: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                      <label className="text-xs font-medium text-slate-600">Expiry date<input type="date" value={b.expiry_date} onChange={(e) => updateBatch(l.local_id, idx, { expiry_date: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                      <label className="text-xs font-medium text-slate-600">Quantity<input type="number" min="0" placeholder="Qty" value={b.quantity} onChange={(e) => updateBatch(l.local_id, idx, { quantity: Number(e.target.value) || 0 })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                    </div>
                  ))}
                  <button onClick={() => addBatchRow(l.local_id)} className="text-xs text-blue-600 font-medium">+ Split into another batch</button>
                </div>
              ) : l.tracking_mode === 'serial' ? (
                <div className="mt-2">
                  <label className="text-xs text-gray-500">Delivered quantity<input aria-label={`Receiving quantity for ${l.name}`} type="number" min="1" value={l.quantity} onChange={(e) => updateLine(l.local_id, { quantity: e.target.value })} className="block w-24 border border-gray-200 rounded px-2 py-1" /></label>
                  <label className="mt-2 block text-xs text-gray-500">Scan serial<input aria-label={`Scan serial for ${l.name}`} value={l.serial_entry || ''} onChange={(e) => updateLine(l.local_id, { serial_entry: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSerial(l, l.serial_entry); } }} className="block w-full border border-gray-200 rounded px-2 py-1.5" /></label>
                  <p role="status" className="mt-1 text-xs text-slate-600">{l.serial_numbers.length} / {l.quantity} serials captured</p>
                  <div className="flex flex-wrap gap-1 mt-2">{l.serial_numbers.map((serial) => <button type="button" key={serial} onClick={() => updateLine(l.local_id, { serial_numbers: l.serial_numbers.filter((value) => value !== serial) })} className="border border-slate-200 rounded px-2 py-1 text-xs">{serial} Ã—</button>)}</div>
                </div>
              ) : (
                <label className="mt-3 block max-w-44 text-sm font-medium text-slate-700">Delivered quantity<input aria-label={`Receiving quantity for ${l.name}`} type="number" min="1" value={l.quantity} onChange={(e) => updateLine(l.local_id, { quantity: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
              )}
              {can('retail_purchasing.view_cost') && <label className="mt-3 block max-w-44 text-sm font-medium text-slate-700">Cost per unit<input type="number" min="0" step="0.01" value={l.unit_cost} onChange={(e) => updateLine(l.local_id, { unit_cost: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>}
            </div>
          ))}
        </section>}

        {lines.length > 0 && !review && <Button className="w-full" disabled={busy} onClick={reviewReceipt}>Review purchase</Button>}
        {lines.length > 0 && review && <section className="rounded-xl border border-slate-300 bg-white p-4 space-y-3 text-sm" aria-label="Receipt review">
          <h2 className="font-semibold">3. Review purchase before saving</h2>
          <p>Supplier: {suppliers.find((supplier) => String(supplier.id) === String(supplierId))?.name || `#${supplierId}`} Â· {purchaseOrderId ? `PO #${purchaseOrderId}` : 'Direct receipt'} Â· Invoice {invoiceNumber || 'not supplied'}</p>
          {lines.map((line) => { const received = line.tracking_mode === 'batch' ? line.batches.reduce((sum,batch) => sum + Number(batch.quantity || 0), 0) : Number(line.quantity); const ordered = poDetail?.lines?.find((item) => Number(item.id) === Number(line.purchase_order_line_id)); const remaining = ordered ? Number(ordered.ordered_quantity) - Number(ordered.quantity_received) : null; return <p key={line.local_id} className="border-t pt-2">{line.name}: receiving {received}{remaining != null && ` of ${remaining} remaining Â· ${received < remaining ? 'Short' : received > remaining ? 'Over' : 'Exact'}`}{line.tracking_mode === 'serial' && ` Â· ${line.serial_numbers.length} serials`}{line.tracking_mode === 'batch' && ` Â· ${line.batches.filter((batch) => Number(batch.quantity) > 0).length} batches`}</p>; })}
          <p className="font-medium">Inventory increases by {lines.reduce((sum,line) => sum + (line.tracking_mode === 'batch' ? line.batches.reduce((amount,batch) => amount + Number(batch.quantity || 0),0) : Number(line.quantity)),0)} units. {paymentMethod === 'credit' ? 'A supplier payable will be recorded.' : 'The selected funding method will be used.'}</p>
          {can('retail_purchasing.view_cost') && <p>Estimated value <strong>{formatCurrency(lines.reduce((sum,line) => sum + Number(line.unit_cost || 0) * (line.tracking_mode === 'batch' ? line.batches.reduce((amount,batch) => amount + Number(batch.quantity || 0),0) : Number(line.quantity)),0))}</strong></p>}
          <div className="flex gap-2"><Button variant="outline" onClick={() => setReview(false)}>Edit purchase</Button><Button disabled={busy} onClick={submit}>{busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Save purchase and update stock</Button></div>
        </section>}

        </>}
      </div>
    </AdminLayout>
  );
}
