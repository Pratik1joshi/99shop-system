'use client';

/**
 * Payment reminders — the restaurant's WhatsApp reminder workflow, driven by
 * open Retail credit. Staff send each message in WhatsApp; the system records
 * only that the reminder was opened, with the balance at that moment.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BellRing, Check, MessageCircle, Search, Send, X } from 'lucide-react';
import AdminLayout from '@/components/admin/admin-layout';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';
import { SHOP } from '@/lib/shop-info';
import { formatNepalTime } from '@/lib/time-utils';
import { DEFAULT_REMINDER_MESSAGE, fillTemplate, openWhatsapp, whatsappNumber } from '@/lib/whatsapp.js';

const FILTERS = [
  { id: 'all', label: 'All open credit', test: () => true },
  { id: 'overdue', label: 'Over 30 days', test: (c) => c.days_outstanding > 30 },
  { id: 'not_reminded', label: 'Not reminded in 7 days', test: (c) => !c.last_reminded_at || Date.now() - new Date(c.last_reminded_at).getTime() > 7 * 86400000 },
];

export default function RetailRemindersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(DEFAULT_REMINDER_MESSAGE);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [queueOpen, setQueueOpen] = useState(false);
  const [opened, setOpened] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try { setCustomers((await apiJson('/api/admin/retail-reminders')).customers || []); setError(''); }
    catch (cause) { setError(cause.error || 'Could not load customers with open credit.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const test = FILTERS.find((f) => f.id === filter)?.test || (() => true);
    return customers.filter((c) => test(c) && (!term || c.name?.toLowerCase().includes(term) || String(c.phone || '').includes(term)));
  }, [customers, filter, search]);
  const selected = rows.filter((c) => selectedIds.has(c.id));
  const allSelected = rows.length > 0 && rows.every((c) => selectedIds.has(c.id));
  const totalDue = rows.reduce((sum, c) => sum + c.amount_due, 0);
  const textFor = (c) => fillTemplate(message, { name: c.name, shop: SHOP.name, amount: formatCurrency(c.amount_due), days: c.days_outstanding, phone: c.phone });

  const toggle = (id) => setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const remind = async (c) => {
    const text = textFor(c);
    if (!openWhatsapp(c.phone, text)) { setError('WhatsApp did not open. Check the phone number and allow pop-ups for this site.'); return; }
    setError('');
    setOpened((prev) => ({ ...prev, [c.id]: true }));
    try {
      await apiJson('/api/admin/retail-reminders', { method: 'POST', body: JSON.stringify({ customer_id: c.id, message: text }) });
      setCustomers((list) => list.map((row) => row.id === c.id ? { ...row, last_reminded_at: new Date().toISOString(), reminder_count: row.reminder_count + 1 } : row));
    } catch (cause) { setError(cause.error || 'The chat opened but the reminder could not be recorded.'); }
  };
  const nextInQueue = selected.find((c) => whatsappNumber(c.phone) && !opened[c.id]);

  return (
    <AdminLayout>
      <header className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 sm:text-3xl"><BellRing className="h-7 w-7 text-green-600" aria-hidden /> Payment reminders</h1>
            <p className="mt-1 text-sm text-gray-500">Customers with open Retail credit, oldest first. Each reminder opens WhatsApp with the message ready to send.</p>
          </div>
          <Link href="/admin/retail-receivables" className="self-start rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Collect a payment</Link>
        </div>
      </header>

      <div className="space-y-4 bg-gray-50 p-4 sm:p-6 lg:p-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><p className="text-2xl font-bold tabular-nums text-gray-900">{rows.length}</p><p className="text-xs text-gray-500">Customers shown</p></div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><p className="text-2xl font-bold tabular-nums text-rose-700">{formatCurrency(totalDue)}</p><p className="text-xs text-gray-500">Open credit shown</p></div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><p className="text-2xl font-bold tabular-nums text-amber-700">{rows.filter((c) => c.days_outstanding > 30).length}</p><p className="text-xs text-gray-500">Over 30 days</p></div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Message</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={1000} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900" />
            <span className="mt-1 block text-xs text-gray-500">Use {'{name}'}, {'{shop}'}, {'{amount}'} (open credit) and {'{days}'} (age of the oldest unpaid sale).</span>
          </label>
        </div>

        <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" aria-hidden />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or phone..." aria-label="Search customers" className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-gray-900" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${filter === f.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>{f.label}</button>)}
            <label className="ml-auto flex items-center gap-2 text-sm font-medium text-gray-800">
              <input type="checkbox" checked={allSelected} onChange={() => setSelectedIds((prev) => { const next = new Set(prev); rows.forEach((c) => (allSelected ? next.delete(c.id) : next.add(c.id))); return next; })} className="h-4 w-4 accent-green-600" />
              Select all shown
            </label>
            <button type="button" disabled={!selected.length} onClick={() => { setOpened({}); setQueueOpen(true); }} className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40">
              <MessageCircle className="h-4 w-4" aria-hidden /> Remind selected ({selected.length})
            </button>
          </div>
        </div>

        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}

        <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {loading ? <p className="py-10 text-center text-gray-500">Loading open credit…</p>
            : rows.length === 0 ? <p className="py-10 text-center text-gray-500">No customers match. Open credit appears here after a credit sale.</p>
            : rows.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.name}`} className="h-4 w-4 shrink-0 accent-green-600" />
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/retail-customers/${c.id}`} className="truncate font-semibold text-gray-900 hover:underline">{c.name}</Link>
                  <p className="text-xs text-gray-500">{c.phone || 'No phone'}{c.phone && !whatsappNumber(c.phone) ? ' · not a WhatsApp number' : ''} · {c.open_sales} open sale{c.open_sales === 1 ? '' : 's'} · oldest {c.days_outstanding} day{c.days_outstanding === 1 ? '' : 's'}</p>
                  <p className="text-xs text-gray-400">{c.last_reminded_at ? `Last reminder opened ${formatNepalTime(c.last_reminded_at)} · ${c.reminder_count} total` : 'Not reminded yet'}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${c.days_outstanding > 30 ? 'bg-rose-100 text-rose-800' : 'bg-amber-50 text-amber-800'}`}>Due {formatCurrency(c.amount_due)}</span>
                <button type="button" disabled={!whatsappNumber(c.phone)} onClick={() => remind(c)} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40">
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden /> WhatsApp
                </button>
              </div>
            ))}
        </div>
      </div>

      {queueOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-label="Send reminders on WhatsApp" className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div><h2 className="text-lg font-bold text-gray-900">Send reminders on WhatsApp</h2><p className="text-xs text-gray-500">{selected.length} selected · {selected.filter((c) => opened[c.id]).length} opened</p></div>
              <button type="button" onClick={() => setQueueOpen(false)} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5" aria-hidden /></button>
            </div>
            <div className="space-y-3 overflow-y-auto px-5 py-4">
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">WhatsApp opens one chat at a time. Press “Open next chat”, send the message there, then come back for the next one.</p>
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {selected.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-900">{c.name} · {formatCurrency(c.amount_due)}</p><p className="truncate text-xs text-gray-500">{textFor(c)}</p></div>
                    <button type="button" disabled={!whatsappNumber(c.phone)} onClick={() => remind(c)} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${opened[c.id] ? 'bg-emerald-50 text-emerald-700' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                      {opened[c.id] ? <><Check className="h-3.5 w-3.5" aria-hidden /> Opened</> : <><MessageCircle className="h-3.5 w-3.5" aria-hidden /> Open</>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
              <button type="button" onClick={() => setQueueOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>
              <button type="button" disabled={!nextInQueue} onClick={() => nextInQueue && remind(nextInQueue)} className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40">
                <Send className="h-4 w-4" aria-hidden /> {nextInQueue ? `Open next chat (${nextInQueue.name})` : 'All done'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
