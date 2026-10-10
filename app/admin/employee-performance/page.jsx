'use client';

/**
 * Staff performance — Retail sales attributed to the staff member who
 * completed them (net of posted returns, same definitions as Reports) and
 * days marked in the attendance register. Nothing here is estimated.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/admin/admin-layout';
import { useToast } from '@/components/ui/toast';
import { friendlyFromError } from '@/lib/friendly-message';
import { apiJson } from '@/lib/authed-fetch';
import { KpiCards } from '@/components/admin/report-kit';
import { formatNepalDate } from '@/lib/time-utils';
import { formatCurrency } from '@/lib/currency';

const ROLE_TONE = {
  admin: 'bg-gray-200 text-gray-800',
  manager: 'bg-indigo-100 text-indigo-800',
  cashier: 'bg-teal-100 text-teal-800',
  accountant: 'bg-amber-100 text-amber-800',
  inventory_staff: 'bg-lime-100 text-lime-800',
  purchasing_staff: 'bg-cyan-100 text-cyan-800',
};
const isoDaysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

export default function EmployeePerformancePage() {
  const { addToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all');
  const [range, setRange] = useState(() => ({ from: isoDaysAgo(29), to: isoDaysAgo(0) }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson(`/api/admin/employee-performance?from=${range.from}&to=${range.to}`);
      setRows(data.performance || []);
    } catch (error) {
      addToast(friendlyFromError(error, 'load_failed'));
    } finally {
      setLoading(false);
    }
  }, [addToast, range.from, range.to]);
  useEffect(() => { load(); }, [load]);

  const roles = useMemo(() => [...new Set(rows.map((r) => r.role))].sort(), [rows]);
  const filtered = useMemo(
    () => (roleFilter === 'all' ? rows : rows.filter((r) => r.role === roleFilter))
      .filter((r) => r.is_active || r.sales_count || r.marked_days)
      .sort((a, b) => b.net_sales - a.net_sales),
    [rows, roleFilter]
  );
  const totals = useMemo(() => filtered.reduce((a, r) => ({ net: a.net + r.net_sales, count: a.count + r.sales_count }), { net: 0, count: 0 }), [filtered]);
  const top = filtered.find((r) => r.sales_count > 0);

  return (
    <AdminLayout>
      <header className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Staff Performance</h1>
            <p className="mt-1 text-sm text-gray-500">Retail sales completed by each staff member, net of posted returns, and days marked in attendance.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <label className="grid gap-1 text-xs font-semibold text-gray-600">From<input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-800" /></label>
            <label className="grid gap-1 text-xs font-semibold text-gray-600">To<input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-800" /></label>
            <label className="grid gap-1 text-xs font-semibold text-gray-600">Role<select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="h-10 rounded-lg border border-gray-300 px-3 text-sm capitalize text-gray-700">
              <option value="all">All roles</option>
              {roles.map((role) => <option key={role} value={role}>{role.replace('_', ' ')}</option>)}
            </select></label>
          </div>
        </div>
      </header>

      <div className="space-y-5 bg-gray-50 p-4 sm:p-6 lg:p-8">
        <KpiCards
          kpis={[
            { key: 'staff', label: 'Staff shown', value: filtered.length, format: 'number' },
            { key: 'net', label: 'Net sales', value: totals.net, format: 'currency' },
            { key: 'count', label: 'Sales completed', value: totals.count, format: 'number' },
            { key: 'top', label: 'Top seller', value: top?.full_name || '—', sub: top ? formatCurrency(top.net_sales) : undefined },
          ]}
        />

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Staff</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 text-right font-semibold">Sales</th>
                  <th className="px-5 py-3 text-right font-semibold">Items</th>
                  <th className="px-5 py-3 text-right font-semibold">Net sales</th>
                  <th className="px-5 py-3 text-right font-semibold">Avg basket</th>
                  <th className="px-5 py-3 text-right font-semibold">Discounts</th>
                  <th className="px-5 py-3 text-right font-semibold">Returns</th>
                  <th className="px-5 py-3 text-right font-semibold">Selling days</th>
                  <th className="px-5 py-3 text-right font-semibold">Attendance</th>
                  <th className="px-5 py-3 font-semibold">Last sale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3"><div className="font-medium text-gray-900">{r.full_name}</div>{r.position && <div className="text-xs text-gray-500">{r.position}</div>}</td>
                    <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${ROLE_TONE[r.role] || 'bg-gray-100 text-gray-700'}`}>{String(r.role).replace('_', ' ')}</span></td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-900">{r.sales_count}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-600">{r.items_sold}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-gray-900">{formatCurrency(r.net_sales)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-600">{r.sales_count ? formatCurrency(r.average_basket) : '—'}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-600">{r.discounts ? formatCurrency(r.discounts) : '—'}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{r.returns_count ? <span className="text-rose-700">{r.returns_count}</span> : '—'}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-600">{r.selling_days}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-600">{r.marked_days ? `${r.present_days} / ${r.marked_days}` : 'Not marked'}</td>
                    <td className="px-5 py-3 text-gray-500">{r.last_sale_at ? formatNepalDate(r.last_sale_at) : '—'}</td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && <tr><td colSpan={11} className="px-5 py-10 text-center text-gray-500">No staff activity in this period.</td></tr>}
                {loading && <tr><td colSpan={11} className="px-5 py-10 text-center text-gray-400">Loading…</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
            Sales are completed Retail sales by the staff member who took payment; returns are credited back to the original seller on the day they post. Attendance shows present days (half days count 0.5) out of days marked in People / Attendance.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
