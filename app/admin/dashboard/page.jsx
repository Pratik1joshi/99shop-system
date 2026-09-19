'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/admin-layout';
import {
  DollarSign, ShoppingCart, TrendingUp, TrendingDown,
  AlertTriangle, PackageX, PackageMinus, Clock3, Receipt, CalendarClock,
  ShoppingBag, ChefHat, UserCheck, Boxes, Package, Award, Users, Sparkles,
  Sun, Sunrise, Sunset, Moon, Inbox, Banknote, RotateCcw, CreditCard, Hash,
  Trash2, Loader2,
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { TrendChart } from '@/components/admin/report-kit';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { formatCalendarDate } from '@/lib/calendar-system.js';
function authedRequest(url) {
  const token = localStorage.getItem('pos_token');
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

function formatBusinessDate(value) {
  return formatCalendarDate(value, { empty: '-' });
}

// ponytail: no shop-hours table exists yet — greeting/open-closed/shift are
// derived from the clock only. Swap for real settings if opening hours become configurable.
function useTimeContext() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const hour = now.getHours();
  let greeting = 'Good evening';
  let GreetingIcon = Moon;
  if (hour < 12) { greeting = 'Good morning'; GreetingIcon = Sunrise; }
  else if (hour < 17) { greeting = 'Good afternoon'; GreetingIcon = Sun; }
  else if (hour < 21) { greeting = 'Good evening'; GreetingIcon = Sunset; }
  else { greeting = 'Good night'; GreetingIcon = Moon; }
  const isOpen = hour >= 7 && hour < 23;
  const shift = hour < 12 ? 'Morning shift' : hour < 17 ? 'Afternoon shift' : hour < 23 ? 'Evening shift' : 'Closed';
  const timeLabel = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kathmandu', hour: 'numeric', minute: '2-digit' });
  return { greeting, GreetingIcon, isOpen, shift, timeLabel };
}

function GrowthBadge({ current, previous }) {
  // Hide noise: quiet today, no history, or a -100% cliff that just means
  // nothing has been settled yet (open floor sales still count separately).
  if (previous == null) return null;
  if (Number(current) === 0) return null;
  if (Number(previous) === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
        <TrendingUp className="w-3 h-3" /> New vs yesterday
      </span>
    );
  }
  const growth = ((current - previous) / previous) * 100;
  const positive = growth >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${positive ? 'text-emerald-600' : 'text-red-600'}`}>
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {positive ? '+' : ''}{growth.toFixed(0)}% vs yesterday
    </span>
  );
}

const ATTENTION_META = {
  out_of_stock: { icon: PackageX, tone: 'text-red-600 bg-red-50' },
  low_stock: { icon: PackageMinus, tone: 'text-amber-600 bg-amber-50' },
  kitchen_delay: { icon: Clock3, tone: 'text-orange-600 bg-orange-50' },
  unpaid_bill: { icon: Receipt, tone: 'text-rose-600 bg-rose-50' },
  reopened_bill: { icon: RotateCcw, tone: 'text-violet-600 bg-violet-50' },
  credit_due: { icon: CreditCard, tone: 'text-indigo-600 bg-indigo-50' },
  reservation_soon: { icon: CalendarClock, tone: 'text-blue-600 bg-blue-50' },
};

const ACTIVITY_META = {
  order_created: { icon: ShoppingBag, tone: 'text-blue-600 bg-blue-50' },
  kitchen_ready: { icon: ChefHat, tone: 'text-emerald-600 bg-emerald-50' },
  reservation_checked_in: { icon: UserCheck, tone: 'text-violet-600 bg-violet-50' },
  manual_restock: { icon: Boxes, tone: 'text-teal-600 bg-teal-50' },
  purchase_receipt: { icon: Boxes, tone: 'text-teal-600 bg-teal-50' },
  opening_balance: { icon: Boxes, tone: 'text-indigo-600 bg-indigo-50' },
  wastage: { icon: PackageX, tone: 'text-red-600 bg-red-50' },
  adjustment: { icon: Package, tone: 'text-gray-500 bg-gray-100' },
  manual_adjustment: { icon: Package, tone: 'text-gray-500 bg-gray-100' },
};

export default function AdminDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const cashierPanel = pathname?.startsWith('/cashier');
  const panelPath = (adminPath, cashierPath) => cashierPanel ? cashierPath : adminPath;
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const { greeting, GreetingIcon, isOpen, shift, timeLabel } = useTimeContext();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0); // re-render "Updated Xs ago"
  const [businessContext, setBusinessContext] = useState(null);
  const [businessContextLoading, setBusinessContextLoading] = useState(true);

  const fetchStats = useCallback(async ({ soft = false } = {}) => {
    if (soft) setRefreshing(true);
    try {
      const res = await authedRequest('/api/admin/dashboard');
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchBusinessContext = useCallback(async () => {
    try {
      const res = await authedRequest('/api/admin/business-days?view=context');
      if (!res.ok) return;
      const data = await res.json();
      setBusinessContext(data || null);
    } catch {
      /* ignore */
    } finally {
      setBusinessContextLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchBusinessContext();
    const t = setInterval(() => {
      fetchStats({ soft: true });
      fetchBusinessContext();
    }, 15000);
    const clock = setInterval(() => setTick((n) => n + 1), 1000);
    return () => { clearInterval(t); clearInterval(clock); };
  }, [fetchStats, fetchBusinessContext]);

  const kpis = stats?.kpis;
  const updatedAgo = (() => {
    void tick;
    if (!lastUpdated) return null;
    const sec = Math.max(0, Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    if (sec < 5) return 'just now';
    if (sec < 60) return `${sec}s ago`;
    return `${Math.floor(sec / 60)}m ago`;
  })();
  // The shared chart kit reads { label, sub, value }; the dashboard API speaks
  // { day, date, value }. One map keeps the kit as the single chart contract.
  const toSeries = (rows) => (rows || []).map((d) => ({ label: d.day, sub: formatCalendarDate(d.date), value: d.value }));
  const revenueTrend = toSeries(stats?.revenueTrend);
  const orderVolume = toSeries(stats?.orderVolume);
  const storeNeedsOpening = !businessContextLoading && !businessContext?.activeSession;
  const storeActionLabel = businessContext?.storeClosed ? 'Reopen Store' : 'Open Store';
  // Whether the store is ACTUALLY open right now — an active session, not a
  // 7am-11pm clock guess. `isOpen` above is only a time-of-day heuristic used
  // for the greeting; using it for status badges is what caused the header
  // to say "Live · Open" while the store-needs-opening banner was showing.
  const storeIsOpen = !businessContextLoading && !storeNeedsOpening;

  return (
    <AdminLayout>
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50">
              <GreetingIcon className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{greeting}</h1>
              <p className="text-gray-500 mt-0.5 text-sm">Shop overview — sales, open work, and what needs action.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => router.push(panelPath('/admin/pos', '/cashier/pos'))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800"
            >
              Takeaway
            </button>
            <button
              type="button"
              onClick={() => router.push(panelPath('/admin/business-days', '/cashier/business-days'))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold hover:bg-emerald-100"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              Opening & Closing
            </button>
            <button
              type="button"
              onClick={() => { fetchStats({ soft: true }); fetchBusinessContext(); }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              title="Refresh now"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {updatedAgo ? `Updated ${updatedAgo}` : 'Refresh'}
            </button>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium ${storeIsOpen ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${storeIsOpen ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
              Live · {storeIsOpen ? 'Open' : 'Closed'}
            </span>
            <div className="text-right">
              <p className="font-semibold text-gray-800 tabular-nums">{timeLabel}</p>
              <p className="text-xs text-gray-400">{shift}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="p-4 sm:p-6 lg:p-8 bg-gray-50 space-y-6">
        {storeNeedsOpening && (
          <section className="border border-amber-200 bg-amber-50 p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Store is closed</p>
                  <h2 className="mt-1 text-xl font-bold text-amber-950">
                    {businessContext?.storeClosed ? 'Reopen the store before taking orders' : 'Open the store before operations begin'}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-amber-900">
                    {businessContext?.storeClosed && businessContext?.current
                      ? `Business Day ${formatBusinessDate(businessContext.current.business_date)} is still available. Start another store session to continue the same day.`
                      : 'No active store session is open yet. Enter the opening cash before POS orders, bills, payments, expenses, and cash movements begin.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push(panelPath('/admin/business-days', '/cashier/business-days'))}
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-gray-950 px-5 text-sm font-semibold text-white hover:bg-black"
              >
                <CalendarClock className="h-4 w-4" />
                {storeActionLabel}
              </button>
            </div>
          </section>
        )}
        {loading && !stats ? (
          <div className="text-center py-20 text-gray-500">Loading dashboard…</div>
        ) : (
          <>
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => { fetchStats({ soft: true }); fetchBusinessContext(); }}
                className={`inline-flex items-center gap-1 text-xs font-semibold hover:underline ${storeIsOpen ? 'text-cyan-700' : 'text-gray-500'}`}
              >
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${storeIsOpen ? `bg-emerald-500 ${refreshing ? 'animate-ping' : 'animate-pulse'}` : 'bg-gray-400'}`} />
                {storeIsOpen ? 'Live' : 'Shop closed'}{updatedAgo ? ` · ${updatedAgo}` : ''}
              </button>
            </div>

            {/* Section 2 — Primary KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 sm:p-2.5 rounded-lg bg-blue-50"><DollarSign className="w-5 h-5 text-blue-600" /></div>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 tabular-nums truncate">{formatCurrency(kpis?.sales?.value || 0)}</h3>
                <p className="text-gray-500 text-xs sm:text-sm mt-1">Paid sales today</p>
                {kpis?.floorOpen?.value > 0 && (
                  <p className="text-[11px] text-sky-700 mt-0.5 tabular-nums">
                    + {formatCurrency(kpis.floorOpen.value)} still on open bills
                  </p>
                )}
                <div className="mt-1"><GrowthBadge current={kpis?.sales?.value || 0} previous={kpis?.sales?.prev} /></div>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 sm:p-2.5 rounded-lg bg-violet-50"><ShoppingCart className="w-5 h-5 text-violet-600" /></div>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 tabular-nums">{kpis?.orders?.value ?? 0}</h3>
                <p className="text-gray-500 text-xs sm:text-sm mt-1">Sales Today</p>
                <div className="mt-1"><GrowthBadge current={kpis?.orders?.value || 0} previous={kpis?.orders?.prev} /></div>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 sm:p-2.5 rounded-lg bg-emerald-50"><Hash className="w-5 h-5 text-emerald-600" /></div>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 tabular-nums truncate">{formatCurrency(kpis?.avgTicket?.value || 0)}</h3>
                <p className="text-gray-500 text-xs sm:text-sm mt-1">Avg ticket</p>
                <p className="text-[11px] text-gray-400 mt-1">{kpis?.avgTicket?.paidBills || 0} paid bills</p>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="p-2 sm:p-2.5 rounded-lg bg-amber-50"><Banknote className="w-5 h-5 text-amber-600" /></div>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 tabular-nums truncate">{formatCurrency(kpis?.profit?.value || 0)}</h3>
                <p className="text-gray-500 text-xs sm:text-sm mt-1">Est. profit</p>
                <div className="mt-1"><GrowthBadge current={kpis?.profit?.value || 0} previous={kpis?.profit?.prev} /></div>
              </div>
            </div>

            {/* Counter pulse */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button type="button" onClick={() => router.push(panelPath('/admin/pos', '/cashier/pos'))} className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 shadow-sm transition">
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{kpis?.activeOrders?.value ?? 0}</p>
                <p className="text-xs text-gray-500 mt-1">Sales in progress</p>
              </button>
              <button type="button" onClick={() => router.push(panelPath('/admin/bills', '/cashier/bills'))} className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 shadow-sm transition">
                <p className="text-2xl font-bold text-gray-900 tabular-nums">{kpis?.openBills?.value ?? 0}</p>
                <p className="text-xs text-gray-500 mt-1">Open bills</p>
              </button>
              <button type="button" onClick={() => router.push(panelPath('/admin/bills', '/cashier/bills'))} className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 shadow-sm transition">
                <p className="text-2xl font-bold text-violet-700 tabular-nums">{kpis?.reopenedBills?.value ?? 0}</p>
                <p className="text-xs text-gray-500 mt-1">Reopened in POS</p>
              </button>
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <p className="text-2xl font-bold text-indigo-700 tabular-nums truncate">{formatCurrency(kpis?.creditOutstanding?.value || 0)}</p>
                <p className="text-xs text-gray-500 mt-1">Credit outstanding today</p>
              </div>
            </div>

            {(kpis?.refundsToday?.value > 0 || kpis?.discountsToday?.value > 0) && (
              <div className="flex flex-wrap gap-3 text-sm">
                {kpis?.refundsToday?.value > 0 && (
                  <div className="inline-flex items-center gap-2 rounded-lg bg-rose-50 text-rose-800 px-3 py-2 border border-rose-100">
                    <RotateCcw className="w-4 h-4" />
                    Refunds today: {formatCurrency(kpis.refundsToday.value)} ({kpis.refundsToday.count})
                  </div>
                )}
                {kpis?.discountsToday?.value > 0 && (
                  <div className="inline-flex items-center gap-2 rounded-lg bg-amber-50 text-amber-900 px-3 py-2 border border-amber-100">
                    Discounts today: {formatCurrency(kpis.discountsToday.value)}
                  </div>
                )}
              </div>
            )}

            {/* Sections 3 & 4 — Needs Attention beside Today's Activity.
                One grid row from lg up; the default items-stretch makes both
                cards the height of the taller one, and each list scrolls inside
                its own card, so 2 items next to 15 still reads as a row rather
                than one short card and one very long one. The cap keeps a busy
                day from pushing everything below the fold. */}
            <div className="grid lg:grid-cols-2 gap-4 lg:max-h-[520px]">
              <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col min-h-0">
                <div className="flex items-center gap-2 mb-4 shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <h2 className="text-base font-semibold text-gray-900">Needs Attention</h2>
                </div>
                {(stats?.needsAttention || []).length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-sm font-medium text-emerald-700">All clear for now</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {isOpen
                        ? 'Counter is quiet — waiting for the next sale.'
                        : 'Shop is closed. Opening hours start at 7:00.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1 flex-1 min-h-0 overflow-y-auto pr-1 max-h-[420px]">
                    {stats.needsAttention.map((item, i) => {
                      const meta = ATTENTION_META[item.type] || { icon: AlertTriangle, tone: 'text-gray-500 bg-gray-100' };
                      const Icon = meta.icon;
                      return (
                        <div key={i} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                          <div className={`p-1.5 rounded-lg shrink-0 ${meta.tone}`}><Icon className="w-4 h-4" /></div>
                          <p className="text-sm text-gray-700">{item.text}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col min-h-0">
                <h2 className="text-base font-semibold text-gray-900 mb-4 shrink-0">Today&apos;s Activity</h2>
                {(stats?.activity || []).length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-sm font-medium text-gray-700">No activity logged yet today</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Scan an item at the counter to record the first sale of the day.
                    </p>
                    <div className="mt-3 flex justify-center gap-2">
                      <button type="button" onClick={() => router.push(panelPath('/admin/pos', '/cashier/pos'))} className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white">New sale</button>
                      <button type="button" onClick={() => router.push(panelPath('/admin/business-days', '/cashier/business-days'))} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
                        <CalendarClock className="h-3.5 w-3.5" />
                        Opening & Closing
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-0 flex-1 min-h-0 overflow-y-auto pr-1 max-h-[420px]">
                    {stats.activity.map((item, i) => {
                      const meta = ACTIVITY_META[item.type] || { icon: Sparkles, tone: 'text-gray-500 bg-gray-100' };
                      const Icon = meta.icon;
                      return (
                        <div key={i} className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
                          <div className={`p-1.5 rounded-lg shrink-0 ${meta.tone}`}><Icon className="w-4 h-4" /></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800">{item.text}</p>
                          </div>
                          <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">{item.atLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Section 5 — Business Overview */}
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900 mb-5">Revenue Trend</h2>
                {revenueTrend.every((d) => d.value === 0) ? (
                  <p className="text-sm text-gray-500 py-10 text-center">No sales yet this week.</p>
                ) : (
                  <TrendChart data={revenueTrend} color="blue" format="currency" height={180} />
                )}
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900 mb-5">Order Volume</h2>
                {orderVolume.every((d) => d.value === 0) ? (
                  <p className="text-sm text-gray-500 py-10 text-center">No orders yet this week.</p>
                ) : (
                  <TrendChart data={orderVolume} color="slate" format="number" height={180} />
                )}
              </div>
            </div>

            {/* Payment mix + hourly + top items */}
            <div className="grid lg:grid-cols-3 gap-4">
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Payment mix today</h2>
                {(stats?.paymentMix || []).length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center">No payments yet.</p>
                ) : (
                  <div className="space-y-3">
                    {stats.paymentMix.map((row) => (
                      <div key={row.method}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium text-gray-800 capitalize">{row.method}</span>
                          <span className="tabular-nums text-gray-600">{formatCurrency(row.total)} · {row.pct}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, row.pct)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Sales by hour</h2>
                {(stats?.hourlySales || []).every((h) => !h.value) ? (
                  <p className="text-sm text-gray-500 py-6 text-center">No hourly sales yet.</p>
                ) : (
                  <div className="flex items-end gap-1 h-36">
                    {(stats.hourlySales || []).map((h) => {
                      const max = Math.max(...(stats.hourlySales || []).map((x) => x.value), 1);
                      const pct = Math.max(4, Math.round((h.value / max) * 100));
                      return (
                        <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${h.label}: ${formatCurrency(h.value)}`}>
                          <div className="w-full rounded-t bg-emerald-500/80" style={{ height: `${pct}%` }} />
                          <span className="text-[9px] text-gray-400 truncate w-full text-center">{h.hour}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900 mb-4">Top items today</h2>
                {(stats?.topItems || []).length === 0 ? (
                  <p className="text-sm text-gray-500 py-6 text-center">No item sales yet.</p>
                ) : (
                  <div className="space-y-2">
                    {stats.topItems.map((item, i) => (
                      <div key={`${item.name}-${i}`} className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-50 last:border-0">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{i + 1}. {item.name}</p>
                          <p className="text-[11px] text-gray-400">{formatCurrency(item.revenue)}</p>
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-gray-700 shrink-0">{item.qty}×</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Section 6 — Performance */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-lg bg-amber-50"><Award className="w-4 h-4 text-amber-600" /></div>
                  <p className="text-xs font-medium text-gray-500">Top Selling Item</p>
                </div>
                {stats?.performance?.topItem ? (
                  <>
                    <p className="text-lg font-semibold text-gray-900 truncate">{stats.performance.topItem.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{stats.performance.topItem.qty} sold today</p>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">No item sales yet today.</p>
                )}
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 rounded-lg bg-green-50"><Users className="w-4 h-4 text-green-600" /></div>
                  <p className="text-xs font-medium text-gray-500">Best Employee</p>
                </div>
                {stats?.performance?.bestEmployee ? (
                  <>
                    <p className="text-lg font-semibold text-gray-900 truncate">{stats.performance.bestEmployee.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{stats.performance.bestEmployee.orders} sales today</p>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">No sales logged to a cashier yet today.</p>
                )}
              </div>
            </div>

            {/* Section 7 — Inventory Snapshot */}
            {(stats?.inventorySnapshot || []).length > 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 className="text-base font-semibold text-gray-900">Inventory Snapshot</h2>
                  <button
                    onClick={() => router.push(panelPath('/admin/inventory', '/cashier/inventory'))}
                    className="text-xs font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
                  >
                    View Inventory
                  </button>
                </div>
                <div className="space-y-1">
                  {stats.inventorySnapshot.map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2 h-2 rounded-full ${item.status === 'out' ? 'bg-red-500' : 'bg-amber-500'}`} />
                        <span className="text-sm font-medium text-gray-800">{item.name}</span>
                      </div>
                      <span className={`text-sm font-semibold ${item.status === 'out' ? 'text-red-600' : 'text-amber-600'}`}>
                        {item.qty} {item.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </>
        )}
      </div>
    </AdminLayout>
  );
}
