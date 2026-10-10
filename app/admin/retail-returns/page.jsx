'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';

export default function RetailReturnsReportPage() {
  const [rows, setRows] = useState(undefined);

  useEffect(() => {
    apiJson('/api/admin/retail-returns').then((d) => setRows(d.retail_returns || [])).catch(() => setRows([]));
  }, []);

  const totalRefunded = (rows || []).reduce((s, r) => s + Number(r.refund_total || 0), 0);

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Returns &amp; Exchanges</h1>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 flex gap-6">
          <div>
            <p className="text-xs uppercase text-gray-400">Returns posted</p>
            <p className="text-lg font-bold text-gray-900">{rows ? rows.length : '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400">Total refunded</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(totalRefunded)}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {rows === undefined ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : rows.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-10">No returns posted yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2">Return #</th>
                  <th className="text-left px-4 py-2">Original sale</th>
                  <th className="text-left px-4 py-2">Customer</th>
                  <th className="text-left px-4 py-2">Method</th>
                  <th className="text-right px-4 py-2">Refund</th>
                  <th className="text-left px-4 py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{r.return_number}</td>
                    <td className="px-4 py-2">
                      <Link href={`/admin/retail-sales-history/${r.original_sale_id}`} className="text-blue-700 hover:underline">
                        {r.sale_number || `#${r.original_sale_id}`}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{r.customer_name || 'Walk-in'}</td>
                    <td className="px-4 py-2 text-gray-600 capitalize">{String(r.refund_method || '').replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2 text-right font-semibold text-gray-900">{formatCurrency(r.refund_total)}</td>
                    <td className="px-4 py-2 text-gray-600">{r.posted_at ? new Date(r.posted_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
