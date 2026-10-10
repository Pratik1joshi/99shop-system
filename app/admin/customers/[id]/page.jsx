'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/admin-layout';
import { ArrowLeft, Phone, Mail, MapPin, CreditCard, History, Receipt, ShoppingBag, Loader2, Tag, Wallet, Star } from 'lucide-react';
import { formatNepalDateTime } from '@/lib/report-dates.js';
import { formatCurrency } from '@/lib/currency';
import CreditTimeline from '@/components/profiles/credit-timeline';
import { buildCustomerCreditTimeline } from '@/lib/credit-timeline';
import { orderTypeLabel } from '@/lib/order-types';
import { apiJson } from '@/lib/authed-fetch';
import { useToast } from '@/components/ui/toast';
import { friendlyMessage, friendlyFromError } from '@/lib/friendly-message';
import { adminInputClass } from '@/components/ui/admin-form';
import BillInvoiceModal from '@/components/admin/bill-invoice-modal';
import ProfileTabActions from '@/components/profiles/profile-tab-actions';
const INPUT = adminInputClass;

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('pos_token') : null;
  return { Authorization: `Bearer ${token}` };
}

function newKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`;
}

function customersPath() {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/cashier')
    ? '/cashier/customers'
    : '/admin/customers';
}

export default function CustomerProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('orders');
  const [invoiceBillId, setInvoiceBillId] = useState(null);
  const { addToast } = useToast();

  const [payFor, setPayFor] = useState(null); // 'pay' | 'writeoff' | null
  const [form, setForm] = useState({ amount: '', method: 'cash', note: '' });
  const [busy, setBusy] = useState(false);
  const keyRef = useRef(newKey());

  const [capabilities, setCapabilities] = useState({});
  const [scAdjust, setScAdjust] = useState(null); // { amount, reason } | null
  const [scBusy, setScBusy] = useState(false);
  const [lpAdjust, setLpAdjust] = useState(null); // { points, reason } | null
  const [lpBusy, setLpBusy] = useState(false);
  useEffect(() => { apiJson('/api/auth/capabilities').then((d) => setCapabilities(d.capabilities || {})).catch(() => {}); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/customers/${id}/profile`, { headers: authHeaders() });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to load profile');
      setData(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-24 text-gray-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading customer…
        </div>
      </AdminLayout>
    );
  }

  if (error || !data?.customer) {
    return (
      <AdminLayout>
        <div className="p-8 text-center">
          <p className="text-red-600">{error || 'Customer not found'}</p>
          <button type="button" onClick={() => router.push(customersPath())} className="mt-4 text-sm text-blue-600 underline">
            Back to customers
          </button>
        </div>
      </AdminLayout>
    );
  }

  const { customer, summary, orders, bills, ledger, payments, outstanding_bills, store_credit_balance, store_credit_transactions, loyalty_balance, loyalty_transactions, loyalty_tier } = data;
  const orderBasePath = customersPath().startsWith('/cashier') ? '/cashier/orders' : '/admin/orders';
  const timeline = buildCustomerCreditTimeline({ customer, bills, ledger });
  const exportsByTab = {
    timeline: {
      label: 'Credit timeline',
      headers: ['When (NPT)', 'Activity', 'Description', 'Amount', 'Balance', 'Status'],
      rows: timeline.map((event) => [
        formatNepalDateTime(event.at), event.title, event.description,
        event.amount > 0 ? formatCurrency(event.amount) : '',
        event.balanceLabel ? formatCurrency(event.balance) : '',
        String(event.status || '').replace(/_/g, ' '),
      ]),
    },
    orders: {
      label: 'Orders',
      headers: ['Order', 'Type', 'Table', 'Total', 'Status', 'When (NPT)'],
      rows: orders.map((o) => [o.order_number, orderTypeLabel(o), o.table_number || '—', formatCurrency(o.total), String(o.status || '').replace(/_/g, ' '), formatNepalDateTime(o.created_at)]),
    },
    bills: {
      label: 'Bills',
      headers: ['Bill', 'Order', 'Total', 'Outstanding', 'Status', 'When (NPT)'],
      rows: bills.map((b) => [b.bill_number, b.order_number || '—', formatCurrency(b.grand_total), formatCurrency(b.outstanding_amount || 0), String(b.payment_status || b.status || '').replace(/_/g, ' '), formatNepalDateTime(b.created_at)]),
    },
    ledger: {
      label: 'Credit ledger',
      headers: ['When (NPT)', 'Type', 'Invoice', 'Debit', 'Credit', 'Balance', 'Note'],
      rows: ledger.map((e) => [formatNepalDateTime(e.created_at), String(e.type || '').replace(/_/g, ' '), e.invoice || '—', e.debit ? formatCurrency(e.debit) : '—', e.credit ? formatCurrency(e.credit) : '—', formatCurrency(e.running_balance), e.note || e.reference || '—']),
    },
    payments: {
      label: 'Payments',
      headers: ['When (NPT)', 'Bill', 'Method', 'Amount', 'Reference'],
      rows: payments.map((p) => [formatNepalDateTime(p.created_at), p.bill_number || '—', [p.method, p.provider].filter(Boolean).join(' · '), formatCurrency(p.amount), p.reference || '—']),
    },
    store_credit: {
      label: 'Store credit',
      headers: ['When (NPT)', 'Type', 'Amount', 'Balance after', 'Reason'],
      rows: store_credit_transactions.map((t) => [formatNepalDateTime(t.created_at), String(t.type || '').toLowerCase(), formatCurrency(t.amount), formatCurrency(t.balance_after), t.reason || '—']),
    },
    loyalty: {
      label: 'Loyalty points',
      headers: ['When (NPT)', 'Type', 'Points', 'Balance after', 'Reason'],
      rows: loyalty_transactions.map((t) => [formatNepalDateTime(t.created_at), String(t.type || '').toLowerCase(), t.points, t.balance_after, t.reason || '—']),
    },
  };
  const activeExport = exportsByTab[tab];

  const openPay = (mode) => {
    setPayFor(mode);
    setForm({ amount: String(summary.outstanding_credit), method: 'cash', note: '' });
  };

  const submitPay = async () => {
    if (!(Number(form.amount) > 0)) { addToast(friendlyMessage('validation', { description: 'Enter an amount.' })); return; }
    setBusy(true);
    try {
      const body = { customer_id: customer.id, amount: Number(form.amount) };
      if (payFor === 'writeoff') {
        body.action = 'writeoff';
        body.reason = form.note;
      } else {
        body.method = form.method;
        body.note = form.note;
      }
      body.external_ref = keyRef.current;
      await apiJson('/api/admin/accounts-receivable', { method: 'POST', body: JSON.stringify(body) });
      addToast(friendlyMessage('save_success', { description: payFor === 'writeoff' ? 'Discount recorded.' : 'Payment recorded.' }));
      keyRef.current = newKey();
      setPayFor(null);
      await load();
    } catch (error) { addToast(friendlyFromError(error, 'save_failed')); }
    finally { setBusy(false); }
  };

  const submitStoreCreditAdjust = async () => {
    if (!(Number(scAdjust.amount) !== 0)) { addToast(friendlyMessage('validation', { description: 'Enter a non-zero amount.' })); return; }
    if (!scAdjust.reason?.trim()) { addToast(friendlyMessage('validation', { description: 'A reason is required.' })); return; }
    setScBusy(true);
    try {
      await apiJson(`/api/admin/customers/${id}/store-credit/adjust`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(scAdjust.amount), reason: scAdjust.reason }),
      });
      addToast(friendlyMessage('save_success', { description: 'Store credit adjusted.' }));
      setScAdjust(null);
      await load();
    } catch (error) { addToast(friendlyFromError(error, 'save_failed')); }
    finally { setScBusy(false); }
  };

  const submitLoyaltyAdjust = async () => {
    if (!(Number(lpAdjust.points) !== 0)) { addToast(friendlyMessage('validation', { description: 'Enter a non-zero points amount.' })); return; }
    if (!lpAdjust.reason?.trim()) { addToast(friendlyMessage('validation', { description: 'A reason is required.' })); return; }
    setLpBusy(true);
    try {
      await apiJson(`/api/admin/retail-loyalty/${id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ points: Number(lpAdjust.points), reason: lpAdjust.reason }),
      });
      addToast(friendlyMessage('save_success', { description: 'Loyalty points adjusted.' }));
      setLpAdjust(null);
      await load();
    } catch (error) { addToast(friendlyFromError(error, 'save_failed')); }
    finally { setLpBusy(false); }
  };

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => router.push(customersPath())}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> Customers
        </button>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {customer.name}
                {customer.is_vip ? <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">VIP</span> : null}
                {customer.is_blacklisted ? <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Blacklisted</span> : null}
              </h1>
              <p className="mt-1 text-sm text-gray-500">Customer #{customer.id} · Since {formatNepalDateTime(customer.created_at)}</p>
              <div className="mt-3 space-y-1 text-sm text-gray-700">
                {customer.phone && <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-gray-400" />{customer.phone}</p>}
                {customer.email && <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-gray-400" />{customer.email}</p>}
                {customer.address && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-400" />{customer.address}</p>}
              </div>
              {customer.notes && <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">{customer.notes}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:min-w-[280px]">
              <Stat label="Credit due" value={formatCurrency(summary.outstanding_credit)} tone={summary.outstanding_credit > 0 ? 'red' : 'green'} />
              <Stat label="Credit limit" value={formatCurrency(summary.credit_limit)} />
              <Stat label="Available" value={formatCurrency(summary.available_credit)} />
              <Stat label="Lifetime spent" value={formatCurrency(customer.total_spent)} />
              <Stat label="Visits" value={String(customer.total_visits || 0)} />
              <Stat label="Open invoices" value={String(summary.outstanding_invoices)} />
              <Stat label="Store credit" value={formatCurrency(store_credit_balance || 0)} tone={store_credit_balance > 0 ? 'green' : undefined} />
              <Stat label="Loyalty points" value={`${loyalty_balance || 0}${loyalty_tier ? ` · ${loyalty_tier}` : ''}`} tone={loyalty_balance > 0 ? 'green' : undefined} />
            </div>
          </div>
          {(summary.outstanding_credit > 0 || capabilities['retail_store_credit.adjust'] || capabilities['retail_loyalty.adjust']) && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
              {summary.outstanding_credit > 0 && (
                <>
                  <button type="button" onClick={() => openPay('pay')} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800">
                    Receive payment
                  </button>
                  <button type="button" onClick={() => openPay('writeoff')} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100">
                    <Tag className="h-4 w-4" /> Give discount
                  </button>
                </>
              )}
              {capabilities['retail_store_credit.adjust'] && (
                <button type="button" onClick={() => setScAdjust({ amount: '', reason: '' })} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">
                  <Wallet className="h-4 w-4" /> Adjust store credit
                </button>
              )}
              {capabilities['retail_loyalty.adjust'] && (
                <button type="button" onClick={() => setLpAdjust({ points: '', reason: '' })} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100">
                  <Star className="h-4 w-4" /> Adjust loyalty points
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-b border-gray-200 pb-2">
          {[
            { id: 'timeline', label: `Timeline (${timeline.length})`, icon: History },
            { id: 'orders', label: `Orders (${orders.length})`, icon: ShoppingBag },
            { id: 'bills', label: `Bills (${bills.length})`, icon: Receipt },
            { id: 'ledger', label: 'Credit ledger', icon: CreditCard },
            { id: 'payments', label: `Payments (${payments.length})`, icon: CreditCard },
            { id: 'store_credit', label: `Store credit (${store_credit_transactions.length})`, icon: Wallet },
            { id: 'loyalty', label: `Loyalty (${loyalty_transactions.length})`, icon: Star },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${tab === t.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="-mx-4 -mt-4 mb-4 overflow-hidden rounded-t-2xl">
            <ProfileTabActions entity={customer.name} tab={activeExport.label} headers={activeExport.headers} rows={activeExport.rows} />
          </div>
          {tab === 'timeline' && <CreditTimeline events={timeline} onOpenBill={setInvoiceBillId} empty="No customer-credit activity recorded." />}
          {tab === 'orders' && (
            <SimpleTable
              router={router}
              empty="No orders yet."
              headers={['Order', 'Type', 'Table', 'Total', 'Status', 'When (NPT)']}
              rows={orders.map((o) => ({
                href: `${orderBasePath}/${o.id}`,
                cells: [
                  <span key="n" className="inline-flex items-center gap-1.5">
                    <span className="font-medium text-blue-700">{o.order_number}</span>
                    {o.was_credit && <CreditBadge />}
                  </span>,
                  orderTypeLabel(o),
                  o.table_number || '—',
                  formatCurrency(o.total),
                  <span key="status" className="capitalize">{String(o.status || '').replace(/_/g, ' ')}</span>,
                  formatNepalDateTime(o.created_at),
                ],
              }))}
            />
          )}
          {tab === 'bills' && (
            <>
              {outstanding_bills?.length > 0 && (
                <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {outstanding_bills.length} invoice(s) still have an outstanding balance.
                </p>
              )}
              <SimpleTable
                router={router}
                empty="No bills yet."
                headers={['Bill', 'Order', 'Total', 'Outstanding', 'Status', 'When (NPT)']}
                rows={bills.map((b) => ({
                  onClick: () => setInvoiceBillId(b.id),
                  cells: [
                    <span key="b" className="inline-flex items-center gap-1.5">
                      <span className="font-medium text-blue-700">{b.bill_number}</span>
                      {b.was_credit && <CreditBadge />}
                    </span>,
                    b.order_number || '—',
                    formatCurrency(b.grand_total),
                    formatCurrency(b.outstanding_amount || 0),
                    <span key="status" className="capitalize">{String(b.payment_status || b.status || '').replace(/_/g, ' ')}</span>,
                    formatNepalDateTime(b.created_at),
                  ],
                }))}
              />
            </>
          )}
          {tab === 'ledger' && (
            <SimpleTable
              empty="No credit ledger entries."
              headers={['When (NPT)', 'Type', 'Invoice', 'Debit', 'Credit', 'Balance', 'Note']}
              rows={ledger.map((e) => [
                formatNepalDateTime(e.created_at),
                <span key="type" className="capitalize">{String(e.type || '').replace(/_/g, ' ')}</span>,
                e.invoice || '—',
                e.debit ? formatCurrency(e.debit) : '—',
                e.credit ? formatCurrency(e.credit) : '—',
                formatCurrency(e.running_balance),
                e.note || e.reference || '—',
              ])}
            />
          )}
          {tab === 'payments' && (
            <SimpleTable
              empty="No payments recorded."
              headers={['When (NPT)', 'Bill', 'Method', 'Amount', 'Reference']}
              rows={payments.map((p) => [
                formatNepalDateTime(p.created_at),
                p.bill_number || '—',
                <span key="method" className="capitalize">{p.method}{p.provider ? ` · ${p.provider}` : ''}</span>,
                formatCurrency(p.amount),
                p.reference || '—',
              ])}
            />
          )}
          {tab === 'store_credit' && (
            <SimpleTable
              empty="No store credit activity."
              headers={['When (NPT)', 'Type', 'Amount', 'Balance after', 'Reason']}
              rows={store_credit_transactions.map((t) => [
                formatNepalDateTime(t.created_at),
                <span key="type" className="capitalize">{String(t.type || '').toLowerCase()}</span>,
                <span key="amt" className={Number(t.amount) >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                  {Number(t.amount) >= 0 ? '+' : ''}{formatCurrency(t.amount)}
                </span>,
                formatCurrency(t.balance_after),
                t.reason || '—',
              ])}
            />
          )}
          {tab === 'loyalty' && (
            <SimpleTable
              empty="No loyalty activity."
              headers={['When (NPT)', 'Type', 'Points', 'Balance after', 'Reason']}
              rows={loyalty_transactions.map((t) => [
                formatNepalDateTime(t.created_at),
                <span key="type" className="capitalize">{String(t.type || '').toLowerCase()}</span>,
                <span key="pts" className={Number(t.points) >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                  {Number(t.points) >= 0 ? '+' : ''}{t.points}
                </span>,
                t.balance_after,
                t.reason || '—',
              ])}
            />
          )}
        </div>
      </div>

      {payFor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 max-h-[94dvh] overflow-y-auto">
            <h3 className="mb-1 text-lg font-bold text-gray-900">{payFor === 'writeoff' ? 'Give discount' : 'Receive payment'} — {customer.name}</h3>
            <p className="mb-4 text-sm text-gray-500">Outstanding {formatCurrency(summary.outstanding_credit)}</p>
            {/* Mode lives inside the dialog so a cashier who opened the wrong
                one can switch without backing out. The outer buttons still
                work — they just pre-select a mode. */}
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setPayFor('pay');
                  setForm((f) => ({ ...f, amount: String(summary.outstanding_credit) }));
                }}
                className={`rounded-md py-1.5 text-sm font-semibold transition-colors ${payFor === 'pay' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                Receive payment
              </button>
              <button
                type="button"
                onClick={() => setPayFor('writeoff')}
                className={`rounded-md py-1.5 text-sm font-semibold transition-colors ${payFor === 'writeoff' ? 'bg-white text-amber-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
              >
                Give discount
              </button>
            </div>
            {payFor === 'writeoff' && (
              <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                A discount forgives part of what this customer owes. No money is received and nothing is added to the drawer — the outstanding balance simply goes down.
              </p>
            )}
            <div className="space-y-3">
              <Field label={payFor === 'writeoff' ? 'Discount amount' : 'Amount'}>
                <input type="number" min="0" step="any" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className={INPUT} />
              </Field>
              {payFor === 'pay' && (
                <>
                  <Field label="Method">
                    <select value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))} className={INPUT}>
                      <option value="cash">Cash</option>
                      <option value="online">Online</option>
                    </select>
                  </Field>
                </>
              )}
              <Field label={payFor === 'writeoff' ? 'Reason' : 'Note'}>
                <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className={INPUT} placeholder={payFor === 'writeoff' ? 'e.g. loyalty discount, goodwill' : 'optional'} />
              </Field>
            </div>
            <div className="mt-6 flex gap-3">
              <button disabled={busy} onClick={submitPay} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 ${payFor === 'writeoff' ? 'bg-amber-600' : 'bg-gray-900'}`}>
                {busy ? 'Saving…' : payFor === 'writeoff' ? 'Apply discount' : 'Post payment'}
              </button>
              <button type="button" onClick={() => setPayFor(null)} className="flex-1 rounded-lg bg-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-300">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {invoiceBillId ? <BillInvoiceModal billId={invoiceBillId} onClose={() => setInvoiceBillId(null)} /> : null}

      {scAdjust && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h3 className="mb-1 text-lg font-bold text-gray-900">Adjust store credit — {customer.name}</h3>
            <p className="mb-4 text-sm text-gray-500">Current balance {formatCurrency(store_credit_balance || 0)}. Positive amount issues credit, negative amount reduces it.</p>
            <div className="space-y-3">
              <Field label="Amount (+/-)">
                <input type="number" step="any" value={scAdjust.amount} onChange={(e) => setScAdjust((f) => ({ ...f, amount: e.target.value }))} className={INPUT} />
              </Field>
              <Field label="Reason">
                <input value={scAdjust.reason} onChange={(e) => setScAdjust((f) => ({ ...f, reason: e.target.value }))} className={INPUT} placeholder="required" />
              </Field>
            </div>
            <div className="mt-6 flex gap-3">
              <button disabled={scBusy} onClick={submitStoreCreditAdjust} className="flex-1 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {scBusy ? 'Saving…' : 'Apply adjustment'}
              </button>
              <button type="button" onClick={() => setScAdjust(null)} className="flex-1 rounded-lg bg-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-300">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {lpAdjust && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h3 className="mb-1 text-lg font-bold text-gray-900">Adjust loyalty points — {customer.name}</h3>
            <p className="mb-4 text-sm text-gray-500">Current balance {loyalty_balance || 0} points. Positive issues points, negative reduces them.</p>
            <div className="space-y-3">
              <Field label="Points (+/-)">
                <input type="number" step="1" value={lpAdjust.points} onChange={(e) => setLpAdjust((f) => ({ ...f, points: e.target.value }))} className={INPUT} />
              </Field>
              <Field label="Reason">
                <input value={lpAdjust.reason} onChange={(e) => setLpAdjust((f) => ({ ...f, reason: e.target.value }))} className={INPUT} placeholder="required" />
              </Field>
            </div>
            <div className="mt-6 flex gap-3">
              <button disabled={lpBusy} onClick={submitLoyaltyAdjust} className="flex-1 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                {lpBusy ? 'Saving…' : 'Apply adjustment'}
              </button>
              <button type="button" onClick={() => setLpAdjust(null)} className="flex-1 rounded-lg bg-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-300">Cancel</button>
            </div>
          </div>
        </div>
      )}

    </AdminLayout>
  );
}

function CreditBadge() {
  return <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-700">Credit</span>;
}

function Field({ label, children }) {
  return <label className="block"><span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>{children}</label>;
}

function Stat({ label, value, tone }) {
  const color = tone === 'red' ? 'text-red-700' : tone === 'green' ? 'text-emerald-700' : 'text-gray-900';
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-0.5 font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function SimpleTable({ headers, rows, empty, router }) {
  if (!rows.length) return <p className="py-10 text-center text-sm text-gray-400">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-gray-100 text-xs uppercase text-gray-400">
          <tr>{headers.map((h) => <th key={h} className="px-2 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((row, i) => {
            const cells = row.cells || row;
            const href = row.href;
            const onClick = row.onClick;
            return (
              <tr key={i} onClick={onClick || (href ? () => router.push(href) : undefined)} className={`hover:bg-gray-50 ${(href || onClick) ? 'cursor-pointer' : ''}`}>
                {cells.map((c, j) => <td key={j} className="px-2 py-2.5 text-gray-700">{c}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
