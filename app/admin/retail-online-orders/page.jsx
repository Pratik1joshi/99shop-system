'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import {useCapabilities} from '@/lib/use-capabilities';
import { Loader2, Plus, Search, X } from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import { Button } from '@/components/ui/button';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';
import { useToast } from '@/components/ui/toast';
import { friendlyFromError, friendlyMessage } from '@/lib/friendly-message';

const STATUS_BADGE = {
  PENDING: 'bg-gray-100 text-gray-600', CONFIRMED: 'bg-blue-100 text-blue-800', PROCESSING: 'bg-amber-100 text-amber-800',
  READY: 'bg-violet-100 text-violet-800', SHIPPED: 'bg-cyan-100 text-cyan-800', DELIVERED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-red-100 text-red-700',
};

export default function RetailOnlineOrdersPage() {
  const router = useRouter();
  const prefix=usePathname().startsWith('/cashier')?'/cashier':'/admin';
  const {can}=useCapabilities();
  const { addToast } = useToast();
  const [rows, setRows] = useState(undefined);
  const [status,setStatus]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(() => {
    apiJson('/api/admin/retail-online-orders?'+new URLSearchParams({status,q:query,page:String(page)})).then((d) => setRows(d.retail_online_orders || [])).catch(() => setRows([]));
  }, [status,query,page]);
  useEffect(() => { load(); }, [load]);

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Online Orders</h1>
          <Button disabled={!can('retail_online_orders.create')} onClick={() => setShowNew(true)}><Plus className="w-4 h-4 mr-1" /> New Order</Button>
        </div>

        <div className="commerce-form flex flex-wrap gap-3"><label>Queue<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}>{['','PENDING','CONFIRMED','PROCESSING','READY','SHIPPED','DELIVERED','CANCELLED','EXPIRED'].map(s=><option key={s} value={s}>{s||'All orders'}</option>)}</select></label><label>Search order, customer or phone<input value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></label></div>
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {rows === undefined ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : rows.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-10">No online orders yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2">Order #</th>
                  <th className="text-left px-4 py-2">Fulfillment</th>
                  <th className="text-left px-4 py-2">Customer</th>
                  <th className="text-right px-4 py-2">Total</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Payment</th>
                  <th className="text-left px-4 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`${prefix}/retail-online-orders/${o.id}`)}>
                    <td className="px-4 py-2 font-medium text-blue-700"><button onClick={()=>router.push(`/admin/retail-online-orders/${o.id}`)}>{o.order_number}</button></td>
                    <td className="px-4 py-2 text-gray-600">{o.fulfillment_type} ? {o.fulfillment_status}</td>
                    <td className="px-4 py-2 text-gray-600">{o.customer_name || '—'}</td>
                    <td className="px-4 py-2 text-right font-semibold text-gray-900">{formatCurrency(o.total)}</td>
                    <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[o.status] || 'bg-gray-100'}`}>{o.status}</span></td>
                    <td className="px-4 py-2 text-gray-600">{o.payment_status}</td>
                    <td className="px-4 py-2 text-gray-600">{new Date(o.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="flex gap-3 px-6"><Button variant="outline" disabled={page===1} onClick={()=>setPage(page-1)}>Previous</Button><span>Page {page}</span><Button variant="outline" disabled={!rows||rows.length<50} onClick={()=>setPage(page+1)}>Next</Button></div>
      {showNew && (
        <NewOrderModal
          onClose={() => setShowNew(false)}
          onCreated={(o) => { setShowNew(false); router.push(`/admin/retail-online-orders/${o.id}`); }}
          notifyError={(e) => addToast(friendlyFromError(e, 'save_failed'))}
          notifyOk={(msg) => addToast(friendlyMessage('save_success', { description: msg }))}
        />
      )}
    </AdminLayout>
  );
}

function NewOrderModal({ onClose, onCreated, notifyError }) {
  const [source, setSource] = useState('MANUAL_ONLINE');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState('PICKUP');
  const [shippingAddress, setShippingAddress] = useState('');
  const [lines, setLines] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);

  const search = async (val) => {
    setQuery(val);
    if (val.trim().length < 2) return setResults([]);
    try {
      const d = await apiJson('/api/admin/products?channel=pos');
      const q = val.toLowerCase();
      const out = [];
      for (const p of d.products || []) {
        for (const v of p.variants || []) {
          const hay = `${p.name} ${v.variant_name || ''} ${v.sku || ''}`.toLowerCase();
          if (hay.includes(q)) out.push({ variantId: v.id, name: `${p.name}${v.variant_name ? ` · ${v.variant_name}` : ''}`, price: v.price });
        }
      }
      setResults(out.slice(0, 8));
    } catch { /* ignore */ }
  };
  const addLine = (row) => {
    setLines((prev) => prev.some((l) => l.variantId === row.variantId) ? prev : [...prev, { variantId: row.variantId, name: row.name, price: row.price, quantity: 1 }]);
    setQuery(''); setResults([]);
  };

  const submit = async () => {
    if (!lines.length) return notifyError({ message: 'Add at least one item.' });
    setBusy(true);
    try {
      const created = await apiJson('/api/admin/retail-online-orders', {
        method: 'POST',
        body: JSON.stringify({
          source, customer_name: customerName || undefined, customer_phone: customerPhone || undefined,
          fulfillment_type: fulfillmentType, shipping_address: fulfillmentType === 'DELIVERY' ? shippingAddress : undefined,
          lines: lines.map((l) => ({ variantId: l.variantId, quantity: Number(l.quantity) })),
        }),
      });
      onCreated(created.retail_online_order);
    } catch (e) { notifyError(e); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 max-h-[92dvh] overflow-y-auto space-y-3">
        <h3 className="text-lg font-bold text-gray-900">New Online Order</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="text-gray-500">Source</span>
            <select value={source} onChange={(e) => setSource(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5">
              <option value="MANUAL_ONLINE">Manual / phone</option>
              <option value="WEBSITE">Website</option>


            </select>
          </label>
          <label className="block text-sm"><span className="text-gray-500">Fulfillment</span>
            <select value={fulfillmentType} onChange={(e) => setFulfillmentType(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5">
              <option value="PICKUP">Click &amp; Collect (pickup)</option>
              <option value="DELIVERY">Delivery</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="text-gray-500">Customer name</span>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
          </label>
          <label className="block text-sm"><span className="text-gray-500">Phone</span>
            <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
          </label>
        </div>
        {fulfillmentType === 'DELIVERY' && (
          <label className="block text-sm"><span className="text-gray-500">Delivery address</span>
            <input value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg px-2 py-1.5" />
          </label>
        )}

        <div className="relative">
          <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-2">
            <Search className="w-4 h-4 text-gray-400" />
            <input value={query} onChange={(e) => search(e.target.value)} placeholder="Search item…" className="w-full py-1.5 text-sm outline-none" />
          </div>
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {results.map((r) => (
                <button key={r.variantId} type="button" onClick={() => addLine(r)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between">
                  <span>{r.name}</span><span className="text-gray-500">{formatCurrency(r.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {lines.length > 0 && (
          <div className="space-y-2">
            {lines.map((l) => (
              <div key={l.variantId} className="flex items-center justify-between text-sm">
                <span>{l.name}</span>
                <div className="flex items-center gap-2">
                  <input type="number" min="1" value={l.quantity} onChange={(e) => setLines((prev) => prev.map((x) => x.variantId === l.variantId ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))} className="w-16 border border-gray-300 rounded px-1.5 py-1" />
                  <span className="w-20 text-right">{formatCurrency(l.price * l.quantity)}</span>
                  <button type="button" onClick={() => setLines((prev) => prev.filter((x) => x.variantId !== l.variantId))} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button className="flex-1" disabled={busy} onClick={submit}>{busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Create Order</Button>
          <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-300">Cancel</button>
        </div>
      </div>
    </div>
  );
}
