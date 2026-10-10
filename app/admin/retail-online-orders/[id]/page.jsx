'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import {useCapabilities} from '@/lib/use-capabilities';
import { ArrowLeft, Loader2 } from 'lucide-react';
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
const NEXT_STATUS = { CONFIRMED:'PROCESSING',PROCESSING:'READY',READY:'SHIPPED' };

export default function RetailOnlineOrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const prefix=usePathname().startsWith('/cashier')?'/cashier':'/admin';
  const {can}=useCapabilities();
  const { addToast } = useToast();
  const [order, setOrder] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [verified,setVerified]=useState(false),[method,setMethod]=useState('cash'),[reference,setReference]=useState(''),[serials,setSerials]=useState({});

  const load = useCallback(() => {
    apiJson(`/api/admin/retail-online-orders/${id}`).then((d) => setOrder(d.retail_online_order)).catch(() => setOrder(null));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (action, body) => {
    setBusy(true);
    try {
      const d = await apiJson(`/api/admin/retail-online-orders/${id}/${action}`, { method: 'POST', body: JSON.stringify(body || {}) });
      addToast(friendlyMessage('save_success', { description: d.message }));
      load();
    } catch (e) { addToast(friendlyFromError(e, 'save_failed')); }
    finally { setBusy(false); }
  };

  if (order === undefined) return <AdminLayout><div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div></AdminLayout>;
  if (!order) return <AdminLayout><div className="p-6 text-center text-gray-500">Order not found.</div></AdminLayout>;

  const nextStatus = order.status==='READY'&&order.fulfillment_type==='PICKUP'?null:NEXT_STATUS[order.status];

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{order.order_number}</h1>
              <p className="text-sm text-gray-500">{order.source} · {order.fulfillment_type} · {order.customer_name || 'No customer name'} {order.customer_phone ? `· ${order.customer_phone}` : ''}</p>
              {order.shipping_address && <p className="text-sm text-gray-500 mt-1">{order.shipping_address}</p>}
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[order.status]}`}>{order.status}</span>
              <span className="text-xs text-gray-500">{order.payment_status}</span>
            </div>
          </div>
          {order.retail_sale_id && (
            <button onClick={() => router.push(`${prefix}/retail-sales-history/${order.retail_sale_id}`)} className="mt-3 text-sm text-blue-700 hover:underline">
              View linked sale {order.retail_sale_number} →
            </button>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr><th className="text-left px-4 py-2">Item</th><th className="text-right px-4 py-2">Qty</th><th className="text-right px-4 py-2">Price</th></tr>
            </thead>
            <tbody>
              {order.lines.map((l) => (
                <tr key={l.id} className="border-t border-gray-100">
                  <td className="px-4 py-2">{l.product_name_snapshot} {l.variant_name_snapshot ? `· ${l.variant_name_snapshot}` : ''}</td>
                  <td className="px-4 py-2 text-right">{l.quantity}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(l.unit_price * l.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
          {Number(order.delivery_charge) > 0 && <div className="flex justify-between"><span className="text-gray-500">Delivery</span><span>{formatCurrency(order.delivery_charge)}</span></div>}
          <div className="flex justify-between text-base font-bold pt-1 border-t border-gray-100"><span>Total</span><span>{formatCurrency(order.total)}</span></div>
        </div>

        {order.reservations?.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Stock reservations</h2>
            {order.reservations.map((r) => (
              <div key={r.id} className="flex justify-between text-sm text-gray-600">
                <span>Variant #{r.variant_id} × {r.quantity}</span>
                <span className="capitalize">{r.status.toLowerCase()}</span>
              </div>
            ))}
          </div>
        )}

        {!order.retail_sale_id&&<section className="commerce-form erp-panel p-4"><h2>Collect payment & fulfill</h2><label>Payment method<select value={method} onChange={e=>setMethod(e.target.value)}><option value="cash">Cash collected</option><option value="online" disabled={!can('retail_online_orders.verify_payment')}>Verified bank / QR payment</option></select></label>{method==='online'&&<label>Bank verification reference<input value={reference} onChange={e=>setReference(e.target.value)}/></label>}<label><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/> I verified that payment has been received</label>{order.lines.filter(l=>l.tracking_mode==='serial').map(l=><label key={l.id}>Serial numbers for {l.product_name_snapshot} (one per line)<textarea onChange={e=>setSerials({...serials,[l.variant_id]:e.target.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)})}/></label>)}<p className="text-xs">Fulfillment posts one canonical sale. After fulfillment, use the linked sale for returns and exchanges.</p></section>}
        {order.events?.length>0&&<section className="erp-panel p-4"><h2>Order timeline</h2>{order.events.map(e=><p key={e.id}>{e.event} ? {e.detail} ? {new Date(e.created_at).toLocaleString()}</p>)}</section>}
        <div className="flex flex-wrap gap-2">
          {order.status === 'PENDING' && (
            <>
              <Button disabled={busy} onClick={() => act('confirm')}>Confirm (reserve stock)</Button>
              <Button variant="outline" disabled={busy} onClick={() => act('cancel')}>Cancel</Button>
            </>
          )}
          {['CONFIRMED', 'PROCESSING', 'READY','SHIPPED'].includes(order.status) && !order.retail_sale_id && (
            <Button disabled={busy||!verified||!can('retail_online_orders.fulfill')} onClick={() => act('fulfill',{payment_method:method,payment_reference:reference,payment_verified:verified,serials})}>Fulfill → Create Sale</Button>
          )}
          {nextStatus && (
            <Button variant="outline" disabled={busy} onClick={() => act('status', { status: nextStatus })}>Mark {nextStatus}</Button>
          )}
          {!order.retail_sale_id&&!['CANCELLED', 'DELIVERED'].includes(order.status) && (
            <Button variant="outline" disabled={busy} onClick={() => act('cancel')}>Cancel</Button>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
