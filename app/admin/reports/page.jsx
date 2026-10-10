'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AdminLayout from '@/components/admin/admin-layout';
import {
  BarChart3, Boxes, Calendar, CalendarDays, Landmark, RotateCcw, Search,
} from 'lucide-react';
import { DataTable } from '@/components/admin/report-kit';
import DateInput from '@/components/ui/date-input.jsx';
import ExpenseDrawer from '@/components/expenses/expense-drawer.jsx';
import { ActionDrawer } from '@/components/erp/primitives';
import { SaleDetail } from '@/components/commerce/sales';
import { useCapabilities } from '@/lib/use-capabilities';
import { formatCurrency } from '@/lib/currency';
import { formatCalendarDate, formatCalendarRangeLabel } from '@/lib/calendar-system.js';
import { useCalendarSystem } from '@/lib/calendar-context.jsx';
import { REPORT_CATALOG as TABS, REPORT_PERIODS as PERIODS } from '@/components/admin/report-catalog.jsx';

/**
 * Every report tab already has its own colour in the sidebar (admin-layout.jsx)
 * — that identity used to vanish the moment you opened the page, leaving 13
 * different reports rendered in the same undifferentiated gray. Reusing the
 * exact same colour per tab here (icon chip + a top accent on each table) is
 * the one signal that makes "which report am I in" legible at a glance,
 * without inventing a second colour language.
 */
// Menu category / master-category are no longer per-report filters — the
// dedicated Category Report answers that in full instead.
const ALL_FILTERS = ['businessDayId', 'employeeId', 'paymentMethod', 'orderType', 'search'];
const NO_FILTERS = [];
const TAB_FILTERS = {
  sales: ['businessDayId', 'employeeId', 'paymentMethod', 'search'],
  finance: ['businessDayId', 'employeeId', 'paymentMethod', 'search'],
  orders: ['businessDayId', 'employeeId', 'paymentMethod', 'search'],
};

const EMPTY_FILTERS = {
  businessDayId: '', employeeId: '',
  paymentMethod: '', orderType: '', search: '',
};

const controlClass = 'h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700';

// Keep the on-screen reports glanceable. The complete columns remain available
// in CSV exports and the row detail view.
const TABLE_COLUMNS = {
  'sales:transactions': ['created_at', 'sale_number', 'customer_name', 'payment', 'grand_total'],
  'finance:ledger': ['spent_on', 'description', 'category', 'supplier', 'payment_method', 'amount'],
  'expenses:ledger': ['spent_on', 'description', 'category', 'supplier', 'payment_method', 'amount'],
  'orders:transactions': ['created_at', 'sale_number', 'customer_name', 'payment', 'grand_total'],
  'finance:transactions': ['created_at', 'sale_number', 'customer_name', 'payment', 'grand_total'],
  'orders:voided-bills': ['voided_at', 'bill_number', 'status', 'payment_method', 'reason', 'grand_total'],
  'menu:detail': ['name', 'category_name', 'quantity', 'revenue', 'profit', 'margin'],
  'categories:category-summary': ['category', 'master_category', 'quantity', 'revenue', 'profit', 'share'],
  'categories:master-category-summary': ['master_category', 'quantity', 'revenue', 'profit', 'share'],
  'inventory:inventory': ['item_name', 'quantity', 'unit', 'min_level', 'value', 'stock_status'],
  'customers:detail': ['name', 'phone', 'is_vip', 'orders', 'spending', 'last_visit'],
  'suppliers:supplier-ledger': ['supplier', 'purchases', 'amount', 'share', 'stock_value', 'last_purchase'],
  'changes:cancelled-orders': ['cancelled_at', 'order_number', 'order_type', 'value', 'cancelled_by', 'reason'],
  'changes:item-changes': ['created_at', 'order_number', 'item', 'action', 'value_difference', 'reason'],
  'changes:voids-refunds': ['created_at', 'type', 'bill_number', 'original_amount', 'amount', 'reason'],
  'changes:bill-revisions': ['created_at', 'bill_number', 'status', 'original_total', 'new_total', 'reason'],
  'changes:discounted-bills': ['created_at', 'bill_number', 'order_type', 'gross', 'discount', 'net_items'],
  'purchases:purchases': ['invoice_date', 'recorded_at', 'invoice_number', 'supplier', 'status', 'payment_method', 'total'],
};

function tabFromSearchParams(searchParams) {
  const requested = searchParams.get('tab');
  return TABS.some((item) => item.id === requested) ? requested : 'sales';
}

/**
 * Refresh used to blank the body: tab always started as "sales", then a
 * useEffect flipped it to ?tab=… and kicked a second fetch. Whichever reply
 * landed last won — a late "sales" payload left data.tab !== tab, so
 * currentData stayed null, loading false, and main rendered nothing.
 * Reading the URL up front + aborting the previous fetch closes that race.
 */
function ReportsPageInner() {
  const { can, role, loading: capabilitiesLoading } = useCapabilities();
  const { calendarSystem } = useCalendarSystem();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(() => tabFromSearchParams(searchParams));
  const [periods, setPeriods] = useState(() => ({ [tabFromSearchParams(searchParams)]: searchParams.get('period') || 'today' }));
  const [customRanges, setCustomRanges] = useState(() => ({ [tabFromSearchParams(searchParams)]: { start: searchParams.get('startDate') || '', end: searchParams.get('endDate') || '' } }));
  const [filterSets, setFilterSets] = useState(() => ({ [tabFromSearchParams(searchParams)]: { ...EMPTY_FILTERS, ...Object.fromEntries(ALL_FILTERS.map((key) => [key, searchParams.get(key) || ''])) } }));
  const [searchDrafts, setSearchDrafts] = useState({});
  const [options, setOptions] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expenseDrawer, setExpenseDrawer] = useState(null);
  const [saleDetailId, setSaleDetailId] = useState(null);
  const [tablePages, setTablePages] = useState({});
  const [tablePageSizes, setTablePageSizes] = useState({});


  const period = periods[tab] || 'today';
  const custom = customRanges[tab] || { start: '', end: '' };
  const filters = filterSets[tab] || EMPTY_FILTERS;
  const searchDraft = searchDrafts[tab] ?? filters.search ?? '';
  const supported = TAB_FILTERS[tab] || NO_FILTERS;
  const activeTab = TABS.find((item) => item.id === tab) || TABS[0];
  const activeFilterCount = supported.filter((key) => Boolean(filters[key])).length;

  const setPeriod = (value) => {
    setPeriods((current) => ({ ...current, [tab]: value }));
    setFilterSets((current) => ({
      ...current,
      [tab]: { ...(current[tab] || EMPTY_FILTERS), businessDayId: '' },
    }));
    setTablePages((current) => ({ ...current, [tab]: {} }));
  };
  const setCustom = (next) => {
    setCustomRanges((current) => ({ ...current, [tab]: next }));
    setTablePages((current) => ({ ...current, [tab]: {} }));
  };
  const setFilter = (key, value) => {
    setFilterSets((current) => ({
      ...current,
      [tab]: { ...(current[tab] || EMPTY_FILTERS), [key]: value },
    }));
    setTablePages((current) => ({ ...current, [tab]: {} }));
  };
  const setSearchDraft = (value) => setSearchDrafts((current) => ({ ...current, [tab]: value }));
  const resetFilters = () => {
    setFilterSets((current) => ({ ...current, [tab]: { ...EMPTY_FILTERS } }));
    setSearchDrafts((current) => ({ ...current, [tab]: '' }));
    setTablePages((current) => ({ ...current, [tab]: {} }));
  };

  const query = useMemo(() => {
    const params = new URLSearchParams({ tab, period, withOptions: '1', calendarSystem });
    if (period === 'custom' && custom.start && custom.end) {
      params.set('startDate', custom.start);
      params.set('endDate', custom.end);
    }
    supported.forEach((key) => {
      if (filters[key]) params.set(key, filters[key]);
    });
    const tabPages = tablePages[tab];
    const tabSizes = tablePageSizes[tab];
    if (tabPages && Object.keys(tabPages).length) {
      params.set('table_pages', JSON.stringify(tabPages));
    }
    if (tabSizes && Object.keys(tabSizes).length) {
      params.set('table_page_sizes', JSON.stringify(tabSizes));
    }
    return params.toString();
  }, [tab, period, custom.start, custom.end, filters, supported, tablePages, tablePageSizes, calendarSystem]);

  const customMissing = period === 'custom' && (!custom.start || !custom.end);
  const load = useCallback(async (signal) => {
    if (customMissing) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('pos_token');
      const response = await fetch(`/api/admin/reports?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'The report could not be built.');
      setData(body);
      if (body.options) setOptions(body.options);
    } catch (loadError) {
      if (loadError?.name === 'AbortError') return;
      setError(loadError.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [customMissing, query]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const currentData = data?.tab === tab ? data : null;
  const tables = useMemo(() => {
    if (!currentData) return [];
    return currentData.tables || (currentData.table ? [{ id: 'detail', ...currentData.table }] : []);
  }, [currentData]);
  const recordTables = tables;

  const setTablePage = useCallback((tableId, page) => {
    setTablePages((current) => ({
      ...current,
      [tab]: { ...(current[tab] || {}), [tableId]: page },
    }));
  }, [tab]);

  const setTablePageSize = useCallback((tableId, pageSize) => {
    setTablePageSizes((current) => ({
      ...current,
      [tab]: { ...(current[tab] || {}), [tableId]: pageSize },
    }));
    setTablePages((current) => ({
      ...current,
      [tab]: { ...(current[tab] || {}), [tableId]: 1 },
    }));
  }, [tab]);

  const fetchFullTable = useCallback(async (tableId) => {
    const token = localStorage.getItem('pos_token');
    const response = await fetch(`/api/admin/reports?${query}&export=1`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'The CSV could not be built.');
    const fullTables = body.tables || (body.table ? [{ id: 'detail', ...body.table }] : []);
    return (fullTables.find((item) => item.id === tableId) || fullTables[0])?.rows || [];
  }, [query]);

  const openExpenseDrawer = useCallback(async (expenseId, fallback = null) => {
    if (!expenseId) return;
    if (fallback) setExpenseDrawer({ ...fallback, id: expenseId });
    const token = localStorage.getItem('pos_token');
    const response = await fetch(`/api/admin/expenses?id=${encodeURIComponent(expenseId)}&status=all&page_size=1`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'The expense details could not be loaded.');
    if (body.expenses?.[0]) setExpenseDrawer(body.expenses[0]);
  }, []);

  const filtersBar = (
    <ReportFilters
      period={period}
      setPeriod={setPeriod}
      custom={custom}
      setCustom={setCustom}
      filters={filters}
      setFilter={setFilter}
      supported={supported}
      options={options}
      searchDraft={searchDraft}
      setSearchDraft={setSearchDraft}
      activeFilterCount={activeFilterCount}
      resetFilters={resetFilters}
      periodEnabled={tab !== 'inventory'}
    />
  );

  return (
    <AdminLayout>
      <header className={`border-b border-gray-200 border-t-4 bg-white px-4 py-5 sm:px-6 lg:px-8 ${activeTab.accent}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${activeTab.chip}`}>
              <activeTab.icon className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-gray-950 sm:text-3xl">{activeTab.label}</h1>
              <p className="mt-1 text-sm text-gray-500">{activeTab.blurb}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <Calendar className="h-3.5 w-3.5" />
              {tab === 'inventory' ? 'Current snapshot' : currentData?.range ? formatCalendarRangeLabel(currentData.range) : 'Select the reporting period below'}
            </p>
          </div>
        </div>
      </header>

      <main className="min-h-screen space-y-5 bg-gray-50 p-4 sm:p-6 lg:p-8">
        <section aria-label="Retail report library" className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-bold text-gray-950">Retail report library</h2><span className="text-xs text-gray-500">Scroll for more reports →</span></div>
          <nav aria-label="Choose a report" className="mt-3 flex min-w-0 gap-2 overflow-x-auto pb-2">
            {TABS.filter((report) => !capabilitiesLoading && can(`report.${report.id}.view`)).map((report) => <Link key={report.id} href={`?tab=${report.id}`} title={report.label} aria-current={tab === report.id ? 'page' : undefined} className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600 ${tab === report.id ? 'border-pink-400 bg-pink-50 font-bold text-pink-900' : 'border-gray-200 text-gray-700 hover:border-pink-300 hover:bg-pink-50/60'}`}><report.icon className="h-4 w-4" aria-hidden />{report.shortLabel}</Link>)}
          </nav>
          <nav aria-label="Other report areas" className="mt-2 flex min-w-0 gap-2 overflow-x-auto border-t border-gray-100 pt-3 pb-1">{[
            { label: 'Retail analytics', href: '/admin/retail-analytics', permission: 'retail_analytics.view', adminOnly: true, icon: BarChart3 },
            { label: 'Inventory reports', href: '/admin/retail-inventory-reports', permission: 'retail_inventory.view', adminOnly: true, icon: Boxes },
            { label: 'Financial statements', href: `${role === 'cashier' ? '/cashier' : '/admin'}/financial-reports`, permission: 'financial_reports.access', icon: Landmark },
            { label: 'Daily summary', href: `${role === 'cashier' ? '/cashier' : '/admin'}/summary-report`, permission: 'reports.view', icon: CalendarDays },
          ].filter((item) => !capabilitiesLoading && can(item.permission) && (!item.adminOnly || role !== 'cashier')).map((item) => <Link key={item.href} href={item.href} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:border-pink-300 hover:bg-pink-50/60"><item.icon className="h-4 w-4" aria-hidden />{item.label}</Link>)}</nav>
        </section>
        {/* Period controls must stay visible even when the fetch race leaves no rows yet. */}
        {(!currentData || customMissing || !recordTables.length) && (
          <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">{filtersBar}</section>
        )}
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error} <button type="button" onClick={() => load()} className="ml-2 font-semibold underline">Try again</button></div>}
        {loading && !currentData && !customMissing && <RecordsSkeleton />}

        {currentData && !customMissing && (
          <div className={`space-y-5 transition-opacity ${loading ? 'opacity-60' : ''}`}>
            {currentData.notes?.map((note) => <p key={note} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">{note}</p>)}
            {!!currentData.kpis?.length && <section aria-label="Report totals" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {currentData.kpis.map((item) => <div key={item.key} className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-semibold text-gray-500">{item.label}</p>
                <strong className="mt-1 block text-xl tabular-nums text-gray-950">{formatCurrency(item.value)}</strong>
                {item.hint && <p className="mt-1 text-xs text-gray-500">{item.hint}</p>}
              </div>)}
            </section>}
            {!recordTables.length ? (
              <EmptyMessage>No {activeTab.label.toLowerCase()} records match this period and these filters.</EmptyMessage>
            ) : null}

            {recordTables.map((table) => (
              <DataTable
                key={`${tab}-${table.id}`}
                title={table.title || `${activeTab.label} details`}
                accentClass={activeTab.accent}
                columns={table.columns}
                rows={table.rows || []}
                empty={table.empty || 'No records match this report.'}
                pagination={table.pagination}
                tableTotals={table.totals}
                paymentTotals={table.paymentTotals}
                pageLoading={loading}
                onPageChange={(page) => setTablePage(table.id, page)}
                onPageSizeChange={(pageSize) => setTablePageSize(table.id, pageSize)}
                onExportAll={() => fetchFullTable(table.id)}
                csvName={`${tab}-${table.id}-${currentData.range?.start || 'records'}`}
                visibleColumnKeys={TABLE_COLUMNS[`${tab}:${table.id}`]}
                onEntityClick={(link) => {
                  if (link.type === 'expense') { openExpenseDrawer(link.id).catch((drawerError) => setError(drawerError.message)); return true; }
                  return false;
                }}
                onRowClick={['sales', 'orders', 'finance'].includes(tab)
                  ? (row) => { if (row._record_id) setSaleDetailId(row._record_id); }
                  : tab === 'expenses'
                    ? (row) => openExpenseDrawer(row._record_id || row.id, row).catch((drawerError) => setError(drawerError.message))
                    : undefined}
                toolbar={filtersBar}
               
              />
            ))}
          </div>
        )}
      </main>
      {expenseDrawer && <ExpenseDrawer expense={expenseDrawer} category={String(expenseDrawer.category || 'Other').replace(/_/g, ' ')} onClose={() => setExpenseDrawer(null)} />}
      <ActionDrawer open={!!saleDetailId} onOpenChange={(open) => { if (!open) setSaleDetailId(null); }} title="Sale detail" description="Retail receipt and payments">
        {saleDetailId && <SaleDetail key={saleDetailId} id={saleDetailId} />}
      </ActionDrawer>
    </AdminLayout>
  );
}

function ReportsRoute() {
  const params = useSearchParams();
  return <ReportsPageInner key={params.toString()} />;
}

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500">
          Loading report…
        </div>
      }
    >
      <ReportsRoute />
    </Suspense>
  );
}

function ReportFilters({
  period, setPeriod, custom, setCustom, filters, setFilter, supported, options,
  searchDraft, setSearchDraft, activeFilterCount, resetFilters, periodEnabled,
}) {
  const enabled = (key) => supported.includes(key);
  return <div className="space-y-4 p-4 sm:p-5">
    {periodEnabled && <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Period</p>
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((item) => <button key={item.id} type="button" onClick={() => setPeriod(item.id)} className={`rounded-lg px-3 py-2 text-sm font-medium ${period === item.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{item.label}</button>)}
        {period === 'custom' && <div className="flex flex-wrap items-center gap-2">
          <DateInput value={custom.start} onChange={(value) => setCustom({ ...custom, start: value })} className={controlClass} />
          <span className="text-sm text-gray-400">to</span>
          <DateInput value={custom.end} onChange={(value) => setCustom({ ...custom, end: value })} className={controlClass} />
        </div>}
      </div>
    </div>}

    <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
      {enabled('businessDayId') && <select value={filters.businessDayId} onChange={(event) => setFilter('businessDayId', event.target.value)} className={controlClass}>
        <option value="">Calendar date range</option>
        {(options?.businessDays || []).map((day) => <option key={day.id} value={day.id}>Business Day {formatCalendarDate(day.business_date)} · {day.status}</option>)}
      </select>}
      {enabled('employeeId') && <select value={filters.employeeId} onChange={(event) => setFilter('employeeId', event.target.value)} className={controlClass}>
        <option value="">All employees</option>
        {(options?.employees || []).map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.role}</option>)}
      </select>}
      {enabled('paymentMethod') && <select value={filters.paymentMethod} onChange={(event) => setFilter('paymentMethod', event.target.value)} className={controlClass}>
        <option value="">All payment methods</option>
        {(options?.paymentMethods || []).map((method) => {
          const value = typeof method === 'string' ? method : method.id;
          const label = typeof method === 'string' ? method : method.label;
          return <option key={value} value={value}>{label}</option>;
        })}
      </select>}
      {enabled('search') && <form onSubmit={(event) => { event.preventDefault(); setFilter('search', searchDraft.trim()); }} className="relative min-w-[210px] flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} onBlur={() => setFilter('search', searchDraft.trim())} placeholder="Search these records…" className="h-10 w-full rounded-lg border border-gray-300 pl-9 pr-3 text-sm text-gray-900" />
      </form>}
      {activeFilterCount > 0 && <button type="button" onClick={resetFilters} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-600 hover:bg-gray-50"><RotateCcw className="h-3.5 w-3.5" />Clear {activeFilterCount}</button>}
    </div>
  </div>;
}

function EmptyMessage({ children }) {
  return <div className="rounded-2xl border border-gray-200 bg-white px-5 py-12 text-center text-sm text-gray-500">{children}</div>;
}

function RecordsSkeleton() {
  return <div className="space-y-5 animate-pulse"><div className="h-12 rounded-xl border border-gray-200 bg-white" /><div className="h-96 rounded-2xl border border-gray-200 bg-white" /></div>;
}
