'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/admin/admin-layout';
import { apiJson } from '@/lib/authed-fetch';

export default function RetailAttentionPage() {
  const [items, setItems] = useState(null);
  const [cutoff, setCutoff] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    apiJson('/api/admin/retail-overview')
      .then((result) => { setItems(result.attention); setCutoff(result.cutoff); })
      .catch((cause) => setError(cause.error || cause.message || 'Attention is unavailable.'));
  }, []);
  return <AdminLayout><div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
    <header><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Overview / Attention</p><h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Needs attention</h1><p className="text-sm text-slate-600">Current issues from posted Retail and control records. Open a source to review or resolve it.</p>{cutoff && <p className="mt-1 text-xs text-slate-500">Checked {new Date(cutoff).toLocaleString()}</p>}</header>
    {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800">{error}</p>}
    {!items && !error && <p role="status">Loading current attention…</p>}
    {items && !items.length && <p className="rounded-xl border bg-white p-6 text-sm text-slate-600">No supported attention items are open.</p>}
    {items?.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><span className={`text-xs font-semibold uppercase tracking-wide ${item.severity === 'critical' ? 'text-red-700' : item.severity === 'high' ? 'text-amber-700' : 'text-slate-600'}`}>{item.severity} · {item.type.replaceAll('_', ' ')}</span><h2 className="mt-1 font-semibold">{item.title}</h2></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{item.status}</span></div><p className="mt-2 text-sm text-slate-600">{item.explanation}</p><Link href={item.href} className="mt-3 inline-block text-sm font-medium text-blue-700 underline">Review source</Link></article>)}
  </div></AdminLayout>;
}
