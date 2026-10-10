'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { Ban, Banknote, CreditCard, ExternalLink, Gift, MessageCircle, Printer, ShieldCheck, Smartphone, Undo2 } from 'lucide-react';
import { WorkspaceHeader, DataTable, ActionDrawer, Money, InlineAlert, Skeleton } from '@/components/erp/primitives';
import { Button } from '@/components/ui/button';
import { apiJson } from '@/lib/authed-fetch';
import { printRetailReceipt } from '@/lib/pos-print';
import { formatNepalDateTime } from '@/lib/report-dates';
import { useCapabilities } from '@/lib/use-capabilities';
import { useAuth } from '@/lib/auth-context';
import { receiptWhatsappLink } from '@/lib/whatsapp-receipt';

const SALE_TONE = { COMPLETED: 'success', HELD: 'warning', CANCELLED: 'danger', REFUNDED: 'info' };
const PAYMENT = {
  cash: { label: 'Cash', icon: Banknote },
  online: { label: 'Online / QR', icon: Smartphone },
  credit: { label: 'Credit (pay later)', icon: CreditCard },
  store_credit: { label: 'Store credit', icon: Gift },
};
const pretty = (value) => String(value || '').replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
const when = (value) => (value ? formatNepalDateTime(value) || String(value) : '—');

export function SaleDetail({ id }) {
  const [sale, setSale] = useState(null);
  const [error, setError] = useState('');
  const [returns, setReturns] = useState([]);
  const [settings, setSettings] = useState({});
  const [printError, setPrintError] = useState('');
  const [voidStatus, setVoidStatus] = useState(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const { can } = useCapabilities();
  const pathname = usePathname() || '';
  const prefix = pathname.startsWith('/cashier') ? '/cashier' : '/admin';
  useEffect(() => {
    const controller = new AbortController();
    const live = () => !controller.signal.aborted;
    apiJson(`/api/admin/retail-sales/${id}`, { signal: controller.signal }).then((data) => { if (live()) setSale(data.retail_sale); }).catch((error) => { if (live()) setError(error.error || 'Could not load sale'); });
    apiJson(`/api/admin/retail-returns?sale_id=${id}`, { signal: controller.signal }).then((data) => { if (live()) setReturns(data.retail_returns || []); }).catch(() => {});
    apiJson('/api/admin/settings', { signal: controller.signal }).then((data) => { if (live()) setSettings(data.settings || data); }).catch(() => {});
    apiJson(`/api/admin/retail-sales/${id}/void`, { signal: controller.signal }).then((data) => { if (live()) setVoidStatus(data); }).catch(() => { if (live()) setVoidStatus(null); });
    return () => controller.abort();
  }, [id, reloadKey]);
  if (error) return <InlineAlert tone="error">{error}</InlineAlert>;
  if (!sale) return <div className="k-doc" role="status" aria-label="Loading sale"><Skeleton className="h-36 w-full" /><Skeleton className="h-48 w-full" /><Skeleton className="h-32 w-full" /></div>;
  const reprint = async () => {
    setPrintError('');
    try {
      await apiJson(`/api/admin/retail-sales/${sale.id}/reprint`, { method: 'POST' });
      setSale({ ...sale, reprint_count: Number(sale.reprint_count || 0) + 1 });
      printRetailReceipt(sale, { reprint: true, settings, size: settings.receipt_paper_size || '80' });
    } catch (error) { setPrintError(error.error || 'Could not record the reprint. Please try again.'); }
  };
  const itemCount = sale.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const refunded = returns.reduce((sum, r) => sum + Number(r.refund_total || 0), 0);
  const onFullPage = pathname.includes(`/retail-sales-history/${sale.id}`);
  const voided = returns.some((r) => String(r.reason || '').startsWith('Voided:'));
  const whatsappHref = receiptWhatsappLink(sale, { shopName: settings.shop_name || '99 Shop by Shahana', date: when(sale.completed_at || sale.created_at) });
  const canReturn = can('retail_return.create') && sale.status === 'COMPLETED';
  const totals = [
    ['Subtotal', sale.subtotal],
    Number(sale.discount_amount) > 0 && [sale.discount_reason ? `Discount · ${sale.discount_reason}` : 'Discount', -Number(sale.discount_amount)],
    Number(sale.tax_amount) > 0 && ['VAT', sale.tax_amount],
    Number(sale.delivery_charge) > 0 && ['Delivery', sale.delivery_charge],
  ].filter(Boolean);
  return <article className="k-doc">
    <header className="k-doc-hero">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="k-doc-kicker">Sale receipt</p>
          <h3 className="k-doc-number">{sale.sale_number || `#${sale.id}`}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">{voided ? <span className="k-chip k-chip--danger">Voided</span> : <span className={`k-chip k-chip--${SALE_TONE[sale.status] || 'pink'}`}>{pretty(sale.status)}</span>}{refunded > 0 && !voided && <span className="k-chip k-chip--info">Returned <Money value={refunded} /></span>}{Number(sale.amount_due) > 0 && <span className="k-chip k-chip--warning">Due <Money value={sale.amount_due} /></span>}</div>
        </div>
        <div className="text-right"><p className="text-xs font-semibold text-gray-500">Grand total</p><Money value={sale.grand_total} className="k-doc-total mt-1 block" /></div>
      </div>
      <dl className="k-doc-facts">
        <div><dt>Customer</dt><dd>{sale.customer_id ? <Link className="text-pink-700 hover:underline" href={prefix === '/cashier' ? `/cashier/customers/${sale.customer_id}` : `/admin/retail-customers/${sale.customer_id}`}>{sale.customer_name || `Customer #${sale.customer_id}`}</Link> : 'Walk-in'}{sale.customer_phone && <small>{sale.customer_phone}</small>}</dd></div>
        <div><dt>Cashier</dt><dd>{sale.cashier_name || '—'}</dd></div>
        <div><dt>{sale.completed_at ? 'Completed' : 'Started'}</dt><dd>{when(sale.completed_at || sale.created_at)}</dd></div>
        <div><dt>Business day</dt><dd>{sale.business_day_id ? `#${sale.business_day_id}` : '—'}{sale.channel && sale.channel !== 'retail_pos' && <small>{pretty(sale.channel)}</small>}</dd></div>
      </dl>
    </header>

    <section className="k-card" aria-label="Items">
      <h3>Items <span>{itemCount} pc{itemCount === 1 ? '' : 's'} · {sale.lines.length} line{sale.lines.length === 1 ? '' : 's'}</span></h3>
      <div className="k-card-body">{sale.lines.map((line) => {
        const variant = line.variant_name_snapshot && line.variant_name_snapshot !== 'Standard' ? line.variant_name_snapshot : '';
        const meta = [line.sku_snapshot, (line.serial_numbers || []).length ? `S/N ${(line.serial_numbers || []).join(', ')}` : ''].filter(Boolean).join(' · ');
        return <div className="k-line" key={line.id}><div><strong>{line.product_name_snapshot}{variant && <span className="font-semibold text-gray-500"> · {variant}</span>}</strong><small>{Number(line.quantity)} × <Money value={line.unit_price} />{Number(line.list_price) > Number(line.unit_price) && <> <del className="text-gray-500"><Money value={line.list_price} /></del></>}{Number(line.discount_amount) > 0 && <> · −<Money value={line.discount_amount} /> off</>}</small>{meta && <small>{meta}</small>}</div><Money value={line.net_amount} /></div>;
      })}</div>
      <div className="border-t border-gray-100 px-4 py-3">
        {totals.map(([label, value]) => <div className="k-sum" key={label}><span>{label}</span><Money value={value} /></div>)}
        <div className="k-sum k-sum--grand"><span>Grand total</span><Money value={sale.grand_total} /></div>
        {Number(sale.amount_due) > 0 && <div className="k-sum k-sum--due"><span>Still to collect</span><Money value={sale.amount_due} /></div>}
      </div>
    </section>

    <section className="k-card" aria-label="Payments">
      <h3>Payments <span>Paid <Money value={sale.amount_paid ?? sale.grand_total - (sale.amount_due || 0)} /></span></h3>
      <div className="k-card-body">{sale.payments.length ? sale.payments.map((p) => {
        const kind = PAYMENT[p.method] || { label: pretty(p.method), icon: Banknote };
        const extra = [p.reference && `Ref ${p.reference}`, Number(p.cash_tendered) > 0 && `Tendered ${Number(p.cash_tendered).toFixed(2)}`, Number(p.change_given) > 0 && `Change ${Number(p.change_given).toFixed(2)}`].filter(Boolean).join(' · ');
        return <div className="k-line" key={p.id}><div className="flex items-start gap-2.5"><span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-pink-50 text-pink-700"><kind.icon className="h-4 w-4" aria-hidden /></span><div><strong>{kind.label}</strong>{extra && <small>{extra}</small>}</div></div><Money value={p.amount} /></div>;
      }) : <p className="py-3 text-sm text-gray-500">No payment recorded yet.</p>}</div>
    </section>

    {sale.credit_override && <section className="k-card" aria-label="Credit limit override">
      <h3>Credit limit override <ShieldCheck className="h-4 w-4 text-amber-600" aria-hidden /></h3>
      <div className="k-card-body space-y-1 py-3 text-sm">
        <p>Allowed <strong><Money value={sale.credit_override.credit_amount} /></strong> on credit · owed before <Money value={sale.credit_override.exposure_before} /> · limit <Money value={sale.credit_override.credit_limit} /></p>
        <p className="k-note">“{sale.credit_override.reason}”</p>
        <p className="text-xs text-gray-500">Approved by {sale.credit_override.approved_by_name || 'Manager / Owner'} · {when(sale.credit_override.approved_at)}</p>
      </div>
    </section>}

    {!!returns.length && <section className="k-card" aria-label="Returns">
      <h3>Returns & refunds <span>{returns.length}</span></h3>
      <div className="k-card-body">{returns.map((r) => <div className="k-line" key={r.id}><div><strong>{r.return_number}</strong><small>{pretty(r.status)} · refunded by {pretty(r.refund_method)}{r.created_at ? ` · ${when(r.created_at)}` : ''}</small></div><Money value={r.refund_total} /></div>)}</div>
    </section>}

    {sale.notes && <p className="k-note"><strong>Note:</strong> {sale.notes}</p>}
    {printError && <InlineAlert tone="error">{printError}</InlineAlert>}
    {notice && <InlineAlert tone="success">{notice}</InlineAlert>}

    <div className="k-actions">
      <Button onClick={reprint}><Printer className="mr-2 h-4 w-4" aria-hidden />Print receipt</Button>
      {sale.status === 'COMPLETED' && <Button asChild variant="outline"><a href={whatsappHref} target="_blank" rel="noopener"><MessageCircle className="mr-2 h-4 w-4 text-green-600" aria-hidden />{sale.customer_phone ? 'Send on WhatsApp' : 'Share on WhatsApp'}</a></Button>}
      {canReturn && voidStatus?.ok && can('retail_pos.use') && <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => setVoidOpen(true)}><Ban className="mr-2 h-4 w-4" aria-hidden />Void sale · {voidStatus.minutesLeft} min left</Button>}
      {canReturn && !voided && <Button asChild variant="outline"><Link href={`${prefix}/retail-sales-history/${sale.id}/return`}><Undo2 className="mr-2 h-4 w-4" aria-hidden />Return or exchange</Link></Button>}
      {!onFullPage && <Button asChild variant="ghost"><Link href={`${prefix}/retail-sales-history/${sale.id}`}><ExternalLink className="mr-2 h-4 w-4" aria-hidden />Open full page</Link></Button>}
    </div>
    <p className="text-xs text-gray-500">{canReturn && !voided ? `A completed sale is never deleted. ${voidStatus?.ok ? 'Rang it up wrong? Void it within the time limit with a manager PIN. ' : ''}Otherwise use Return: stock goes back on the shelf and the money is refunded, with a record kept. ` : ''}Receipt printed again {Number(sale.reprint_count || 0)} time{Number(sale.reprint_count || 0) === 1 ? '' : 's'}.</p>
    {voidOpen && <VoidDialog sale={sale} status={voidStatus} onClose={() => setVoidOpen(false)} onVoided={(message) => { setVoidOpen(false); setNotice(message); setReloadKey((k) => k + 1); }} />}
  </article>;
}

const REFUND_LABEL = {
  cash: 'Hand the cash back from the drawer.',
  online: 'Send the money back to the customer online.',
  store_credit: 'The amount goes back to the customer as store credit.',
  ar_reduction: 'The amount comes off what the customer owes.',
};

/** Reason plus a manager or owner PIN; the server re-checks every rule. */
function VoidDialog({ sale, status, onClose, onVoided }) {
  const { user } = useAuth();
  const canApproveSelf = ['admin', 'manager'].includes(user?.role);
  const [form, setForm] = useState({ reason: '', approver_username: canApproveSelf ? user.username : '', approver_pin: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await apiJson(`/api/admin/retail-sales/${sale.id}/void`, { method: 'POST', body: JSON.stringify(form) });
      onVoided(`Sale voided and approved by ${result.approved_by}. Stock is back on the shelf. ${REFUND_LABEL[result.refund_method] || ''}`);
    } catch (cause) { setError(cause.error || 'Could not void the sale.'); setForm((current) => ({ ...current, approver_pin: '' })); }
    finally { setBusy(false); }
  }
  const field = 'mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm';
  return <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><Dialog.Portal><Dialog.Overlay className="erp-overlay" style={{ zIndex: 120 }} /><Dialog.Content className="erp-dialog" style={{ zIndex: 130, width: 'min(26rem, calc(100vw - 2rem))' }}>
    <Dialog.Title className="flex items-center gap-2 text-lg"><Ban className="h-5 w-5 text-red-600" aria-hidden />Void {sale.sale_number || `sale #${sale.id}`}?</Dialog.Title>
    <Dialog.Description className="mt-1 text-sm text-gray-600">Every item goes back to stock and <Money value={sale.grand_total} className="font-bold" /> is refunded. {REFUND_LABEL[status?.refundMethod]} The sale stays on record, marked as voided.</Dialog.Description>
    <form className="mt-4 grid gap-3" onSubmit={submit}>
      <label className="text-sm font-semibold text-gray-700">Why?<input className={field} required minLength={3} maxLength={200} autoFocus value={form.reason} onChange={set('reason')} placeholder="e.g. Rang up the wrong clip" /></label>
      <label className="text-sm font-semibold text-gray-700">Manager or owner username<input className={field} required autoComplete="off" value={form.approver_username} onChange={set('approver_username')} /></label>
      <label className="text-sm font-semibold text-gray-700">Their PIN<input className={field} required type="password" inputMode="numeric" autoComplete="off" value={form.approver_pin} onChange={set('approver_pin')} /></label>
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      <div className="erp-dialog__actions"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Keep sale</Button><Button type="submit" variant="destructive" loading={busy}>Void sale</Button></div>
    </form>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export default function Sales() {
  const [filters, setFilters] = useState({ search: '', status: '', paymentMethod: '', from: '', to: '', minAmount: '', maxAmount: '' });
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], loading: true });
  const [selected, setSelected] = useState(() => typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('sale'));
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState((old) => ({ ...old, loading: true }));
      try {
        const params = new URLSearchParams({ ...filters, page, page_size: 40 });
        const data = await apiJson(`/api/admin/retail-sales?${params}`, { signal: controller.signal });
        if (!controller.signal.aborted) setState({ rows: data.retail_sales, pagination: data.pagination, loading: false });
      } catch (error) { if (!controller.signal.aborted) setState({ rows: [], loading: false, error: error.error || 'Could not load sales' }); }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [filters, page]);
  const filter = (key,value) => { setFilters({ ...filters, [key]: value }); setPage(1); };
  return <div className="commerce-page"><WorkspaceHeader eyebrow="Sell" title="Sales" description="Every receipt, its payments and returns. Click a sale to see the full bill." />
    <div className="commerce-filters"><label className="min-w-[16rem] flex-1">Search<input type="search" placeholder="Receipt, product, barcode, customer, phone or cashier" value={filters.search} onChange={(e) => filter('search',e.target.value)} /></label><label>Status<select value={filters.status} onChange={(e) => filter('status',e.target.value)}><option value="">All statuses</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></label><label>Payment<select value={filters.paymentMethod} onChange={(e) => filter('paymentMethod',e.target.value)}><option value="">All payments</option>{Object.entries(PAYMENT).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}</select></label>{[['from','From'],['to','To']].map(([key,label]) => <label key={key}>{label}<input type="date" value={filters[key]} onChange={(e) => filter(key,e.target.value)} /></label>)}{[['minAmount','Min total'],['maxAmount','Max total']].map(([key,label]) => <label key={key} className="w-28">{label}<input type="number" min="0" step="0.01" value={filters[key]} onChange={(e) => filter(key,e.target.value)} /></label>)}</div>
    <DataTable rows={state.rows} loading={state.loading} error={state.error} onRowOpen={(s) => setSelected(s.id)} pageInfo={state.pagination && { page, pages: state.pagination.total_pages, total: state.pagination.total }} onPageChange={setPage} columns={[{ key: 'sale_number', label: 'Receipt', render: (s) => <button type="button" className="font-bold text-pink-700 hover:underline" onClick={() => setSelected(s.id)}>{s.sale_number || `#${s.id}`}</button> }, { key: 'completed_at', label: 'Date', render: (s) => when(s.completed_at || s.created_at) }, { key: 'customer_name', label: 'Customer', render: (s) => s.customer_name || <span className="text-gray-500">Walk-in</span> }, { key: 'cashier_name', label: 'Cashier' }, { key: 'status', label: 'Status', render: (s) => <span className={`k-chip k-chip--${SALE_TONE[s.status] || 'pink'}`}>{pretty(s.status)}</span> }, { key: 'grand_total', label: 'Total', numeric: true, render: (s) => <Money value={s.grand_total} className="font-bold" /> }]} />
    <ActionDrawer open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }} title="Sale detail" description="Posted Retail transaction"><SaleDetail key={selected} id={selected} /></ActionDrawer>
  </div>;
}
