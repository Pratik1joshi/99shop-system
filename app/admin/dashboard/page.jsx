'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, Boxes, CalendarClock, CheckCircle2, CircleDollarSign, CreditCard,
  Info, Moon, PackageCheck, PackagePlus, Receipt, RotateCcw, Search, ShoppingBag, Sun, Sunrise, Sunset, TrendingUp, Truck, Wallet,
} from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import LowStockPanel from '@/components/inventory/low-stock-panel';
import { ChartCard, RankBars, TrendChart } from '@/components/admin/report-kit';
import { apiJson } from '@/lib/authed-fetch';
import { useAuth } from '@/lib/auth-context';
import { formatCalendarDate } from '@/lib/calendar-system.js';
import { formatCurrency } from '@/lib/currency';
import { formatNepalTime } from '@/lib/time-utils';
import { useCapabilities } from '@/lib/use-capabilities';

/*
 * Owner home. Reads /api/admin/retail-overview unchanged; the layout answers,
 * in order: how is today going, what needs me, what is running low, and where
 * the money sits.
 */
const TODAY = [
  { key: 'netSales', icon: CircleDollarSign, tone: 'bg-pink-50 text-pink-600' },
  { key: 'grossProfit', icon: TrendingUp, tone: 'bg-emerald-50 text-emerald-600' },
  { key: 'digitalPayments', icon: CreditCard, tone: 'bg-violet-50 text-violet-600' },
  { key: 'returns', icon: RotateCcw, tone: 'bg-amber-50 text-amber-600' },
];
const MONEY = [
  { key: 'cashBalance', label: 'Cash in the drawer account', icon: Banknote },
  { key: 'receivables', label: 'Customers owe you', icon: Receipt },
  { key: 'payables', label: 'You owe suppliers', icon: Truck },
  { key: 'inventoryValue', label: 'Stock on the shelves', icon: Boxes },
];
const SEVERITY = {
  critical: { icon: AlertTriangle, tone: 'bg-red-100 text-red-700', label: 'Urgent' },
  high: { icon: AlertTriangle, tone: 'bg-amber-100 text-amber-700', label: 'Soon' },
  medium: { icon: Info, tone: 'bg-sky-100 text-sky-700', label: 'When you can' },
};

function greetingFor(hour) {
  if (hour < 5) return { text: 'Good evening', icon: Moon };
  if (hour < 12) return { text: 'Good morning', icon: Sunrise };
  if (hour < 17) return { text: 'Good afternoon', icon: Sun };
  return { text: 'Good evening', icon: Sunset };
}

/** Today's net sales against the plain daily average of the previous 13 days in the same chart. */
function versusAverage(trend = []) {
  if (trend.length < 2) return null;
  const today = Number(trend[trend.length - 1]?.value) || 0;
  const previous = trend.slice(0, -1).map((d) => Number(d.value) || 0);
  const average = previous.reduce((sum, v) => sum + v, 0) / previous.length;
  if (!(average > 0)) return null;
  return { pct: Math.round(((today - average) / average) * 100), average };
}

const money = (value) => (value == null ? 'Hidden for your role' : formatCurrency(value));

export default function OwnerOverview() {
  const { can } = useCapabilities();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await apiJson('/api/admin/retail-overview')); setError(''); }
    catch (cause) { setError(cause.error || cause.message || 'Overview is unavailable.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const greeting = greetingFor(new Date().getHours());
  const GreetingIcon = greeting.icon;
  const firstName = String(user?.full_name || user?.username || '').trim().split(/\s+/)[0];
  const metric = (key) => data?.metrics.find((m) => m.key === key);
  const compare = versusAverage(data?.charts?.salesTrend);

  const quick = [
    { label: 'Add a product', href: '/admin/products', icon: PackagePlus, show: can('catalog.manage') },
    { label: 'Receive stock', href: '/admin/retail-goods-receipts', icon: PackageCheck, show: can('retail_purchasing.grn.receive') },
    { label: 'Record an expense', href: '/admin/expenses', icon: Wallet, show: can('expenses.manage') },
    { label: 'Find a bill', href: '/admin/retail-transactions', icon: Search, show: can('retail_sale.view') },
  ].filter((item) => item.show);

  return <AdminLayout>
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Hello + the one thing to do next */}
      <section className="relative overflow-hidden rounded-3xl border border-pink-100 bg-gradient-to-br from-white via-pink-50/70 to-rose-50 p-5 shadow-sm sm:p-7">
        <div className="erp-gingham absolute inset-x-0 top-0" aria-hidden />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-amber-500 shadow-sm"><GreetingIcon className="h-6 w-6" aria-hidden /></span>
            <div>
              <p className="text-sm font-bold text-pink-700">{data ? formatCalendarDate(data.businessDate) : ' '}</p>
              <h1 className="text-2xl text-gray-900 sm:text-3xl">{greeting.text}{firstName ? `, ${firstName}` : ''}</h1>
              <p className="mt-1 text-sm text-gray-600">Here&apos;s how the shop is doing today.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data && <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${data.register.open ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              <span className={`h-2 w-2 rounded-full ${data.register.open ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden />{data.register.open ? 'Register open' : 'Register closed'}
            </span>}
            {data && !data.register.open && can('business_days.view') && <Link href="/admin/business-days" className="inline-flex h-11 items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50"><CalendarClock className="h-4 w-4" aria-hidden />Open register</Link>}
            {can('retail_pos.use') && <Link href="/admin/billing" className="inline-flex h-11 items-center gap-2 rounded-xl bg-gray-900 px-5 text-sm font-bold text-white shadow-sm hover:bg-gray-800"><ShoppingBag className="h-4 w-4" aria-hidden />New sale</Link>}
            <button type="button" onClick={load} disabled={loading} aria-label="Refresh" title="Refresh" className="grid h-11 w-11 place-items-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-60">
              <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            </button>
          </div>
        </div>
        {quick.length > 0 && <nav aria-label="Quick actions" className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {quick.map((item) => <Link key={item.href} href={item.href} className="flex items-center gap-2.5 rounded-2xl border border-white bg-white/80 px-3.5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:-translate-y-0.5 hover:border-pink-200 hover:text-pink-800">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-pink-50 text-pink-600"><item.icon className="h-4 w-4" aria-hidden /></span>{item.label}
          </Link>)}
        </nav>}
      </section>

      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error} <button type="button" onClick={load} className="font-semibold underline">Try again</button></p>}
      {data && !data.register.open && <p className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Billing, cash payments and expenses need an open register. Open it first thing, before the first customer.</p>}

      {/* Today */}
      <section aria-labelledby="today-title">
        <h2 id="today-title" className="mb-3 text-xs font-extrabold uppercase tracking-widest text-gray-500">Today</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {TODAY.map(({ key, icon: Icon, tone }, index) => {
            const m = metric(key);
            const Tile = m?.href ? Link : 'div';
            return <Tile key={key} href={m?.href || undefined} title={m?.definition}
              className={`group min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-pink-200 sm:p-5 ${index === 0 || index === TODAY.length - 1 ? 'col-span-2 xl:col-span-1' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`grid h-9 w-9 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" aria-hidden /></span>
                {index === 0 && compare && <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold ${compare.pct >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`} title={`Daily average over the previous 13 days: ${formatCurrency(compare.average)}`}>
                  {compare.pct >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}{Math.abs(compare.pct)}% vs usual
                </span>}
              </div>
              {loading && !data ? <span className="mt-4 block h-7 w-28 animate-pulse rounded-lg bg-gray-100" /> : <p className="mt-3 truncate text-2xl font-extrabold tabular-nums text-gray-900">{m ? money(m.value) : '—'}</p>}
              <p className="mt-0.5 text-sm font-semibold text-gray-600">{m?.label || ' '}</p>
            </Tile>;
          })}
        </div>
      </section>

      {data && <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ChartCard title="Sales, last 14 days" hint="Net sales each day after discounts and returns" isEmpty={!data.charts?.hasSales} empty="Your sales will draw a line here after the first few days of selling.">
            <TrendChart data={data.charts?.salesTrend || []} color="pink" height={250} />
          </ChartCard>

          <section aria-labelledby="recent-title" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="recent-title" className="text-base font-bold text-gray-900">Latest sales</h2>
              <Link href="/admin/retail-sales-history" className="text-sm font-semibold text-pink-700 hover:underline">All sales →</Link>
            </div>
            {data.activity.length ? <ul className="divide-y divide-gray-100">
              {data.activity.map((sale) => <li key={sale.id}><Link href={sale.href} className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 hover:bg-pink-50/60">
                <span className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pink-50 text-pink-600"><ShoppingBag className="h-4 w-4" aria-hidden /></span>
                  <span className="min-w-0"><span className="block truncate font-bold text-gray-900">{sale.number}</span><span className="block text-xs text-gray-500">{sale.at ? formatNepalTime(sale.at) : ''}</span></span></span>
                <span className="shrink-0 font-bold tabular-nums text-gray-900">{formatCurrency(sale.total)}</span>
              </Link></li>)}
            </ul> : <p className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">No sales yet. Completed sales from Billing show up here.</p>}
          </section>
        </div>

        <div className="space-y-4">
          <section aria-labelledby="attention-title" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="attention-title" className="text-base font-bold text-gray-900">Needs you</h2>
              <span className="text-xs font-semibold text-gray-500">{data.attention.length ? `${data.attention.length} to check` : ''}</span>
            </div>
            {data.attention.length ? <ul className="space-y-2">
              {data.attention.map((item) => {
                const style = SEVERITY[item.severity] || SEVERITY.medium;
                return <li key={item.id}><Link href={item.href} className="flex items-start gap-3 rounded-xl border border-gray-100 p-3 hover:border-pink-200 hover:bg-pink-50/40">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${style.tone}`}><style.icon className="h-4 w-4" aria-hidden /></span>
                  <span className="min-w-0"><span className="block text-sm font-bold text-gray-900">{item.title}</span><span className="block text-xs text-gray-500">{item.explanation}</span></span>
                </Link></li>;
              })}
            </ul> : <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-5 w-5" aria-hidden />All clear. Nothing needs you right now.</p>}
          </section>

          <LowStockPanel limit={5} />

          <ChartCard title="Best-selling categories" hint="Last 14 days" isEmpty={!data.charts?.categories?.length} empty="Appears once products have sold.">
            <RankBars data={data.charts?.categories || []} color="pink" limit={6} />
          </ChartCard>
        </div>
      </div>}

      {data && <section aria-labelledby="money-title">
        <h2 id="money-title" className="mb-3 text-xs font-extrabold uppercase tracking-widest text-gray-500">Where the money sits</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          {MONEY.map(({ key, label, icon: Icon }) => {
            const m = metric(key);
            const Tile = m?.href ? Link : 'div';
            return <Tile key={key} href={m?.href || undefined} title={m?.definition} className="flex min-w-0 items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-pink-200">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gray-50 text-gray-600"><Icon className="h-5 w-5" aria-hidden /></span>
              <span className="min-w-0"><span className="block truncate text-lg font-extrabold tabular-nums text-gray-900">{m ? money(m.value) : '—'}</span><span className="block truncate text-xs font-semibold text-gray-500">{label}</span></span>
            </Tile>;
          })}
        </div>
        <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <Link href={data.reconciliation.href} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold ${data.reconciliation.healthy ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {data.reconciliation.healthy ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
            {data.reconciliation.healthy ? 'Books and stock agree' : `${data.reconciliation.failedChecks} difference${data.reconciliation.failedChecks === 1 ? '' : 's'} to review`}
          </Link>
          <span>Checked {new Date(data.cutoff).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
        </p>
      </section>}
    </div>
  </AdminLayout>;
}
