'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/admin-layout';
import RetailPos from '@/components/pos/retail-pos';
import { apiJson } from '@/lib/authed-fetch';

/** Shared retail checkout with one business-day gate for both staff panels. */
export default function RetailBillingPage({ businessDaysPath = '/admin/business-days' }) {
  const router = useRouter();
  const [status, setStatus] = useState(undefined);

  useEffect(() => {
    let active = true;
    apiJson('/api/admin/business-days?view=context')
      .then((data) => { if (active) setStatus(data); })
      .catch(() => { if (active) setStatus(null); });
    return () => { active = false; };
  }, []);

  return (
    <AdminLayout>
      {status === undefined ? (
        <div className="flex min-h-[60vh] items-center justify-center" aria-label="Loading billing">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : status?.activeSession ? (
        <RetailPos />
      ) : (
        <div className="flex min-h-[70vh] items-center justify-center bg-slate-50 p-4">
          <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <CalendarClock className="h-6 w-6" />
            </div>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-950">
              {status?.storeClosed ? 'Store session closed' : 'Open the business day'}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {status?.storeClosed
                ? 'Reopen the store session before creating another bill.'
                : 'Record the opening cash once, then Billing will be ready for the day.'}
            </p>
            <button
              type="button"
              onClick={() => router.push(businessDaysPath)}
              className="mt-6 h-12 w-full rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition-transform duration-150 active:scale-[0.98]"
            >
              {status?.storeClosed ? 'Reopen store' : 'Open business day'}
            </button>
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
