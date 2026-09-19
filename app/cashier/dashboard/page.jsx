'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, ReceiptText, RefreshCw, ShoppingBag } from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import { authedRequest } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';

/**
 * Counter landing screen.
 *
 * A retail till has no floor plan, so this lists the sales that are still open
 * — parked baskets and bills waiting on payment — and hands each one back to
 * the POS.
 */
export default function CashierDashboard() {
  const router = useRouter();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOpenSales = useCallback(async () => {
    try {
      const response = await authedRequest('/api/admin/bills?tab=active&pageSize=50');
      if (!response.ok) return;
      const data = await response.json();
      setBills(data.bills || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOpenSales();
    const timer = window.setInterval(fetchOpenSales, 10000);
    return () => window.clearInterval(timer);
  }, [fetchOpenSales]);

  return (
    <AdminLayout>
      <main className="min-h-screen bg-gray-50 px-3 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Dashboard</h1>
              <p className="mt-1 text-sm text-gray-500">
                Sales that are still open. Select one to continue it at the till.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/cashier/pos')}
                className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800"
              >
                <ShoppingBag className="h-4 w-4" />
                New sale
              </button>
              <button
                type="button"
                onClick={() => router.push('/cashier/business-days')}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                <CalendarClock className="h-4 w-4" />
                Opening &amp; Closing
              </button>
              <button
                type="button"
                onClick={fetchOpenSales}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-cyan-600" />
              <h2 className="font-semibold text-gray-900">Open sales</h2>
            </div>
            {loading ? (
              <p className="py-12 text-center text-sm text-gray-400">Loading open sales…</p>
            ) : bills.length ? (
              <div className="space-y-2">
                {bills.map((bill) => (
                  <button
                    key={bill.id}
                    type="button"
                    onClick={() =>
                      router.push(
                        `/cashier/pos?order=${bill.orderId}${
                          bill.orderStatus === 'awaiting_payment' ? '&pay=1' : ''
                        }`
                      )
                    }
                    className="flex w-full items-center justify-between gap-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-left hover:border-sky-400"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">
                        {bill.customerName || 'Counter sale'}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {bill.billNumber || bill.orderNumber || 'No number yet'}
                        {bill.orderStatus === 'awaiting_payment' ? ' · awaiting payment' : ''}
                      </p>
                    </div>
                    <span className="shrink-0 font-bold text-sky-800">
                      {formatCurrency(bill.total ?? 0)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-gray-400">
                No open sales right now. Start one from the till.
              </p>
            )}
          </section>
        </div>
      </main>
    </AdminLayout>
  );
}
