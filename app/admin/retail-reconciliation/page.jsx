'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/admin/admin-layout';
import { apiJson } from '@/lib/authed-fetch';

const money = (value) => `Rs ${Number(value || 0).toFixed(2)}`;

export default function RetailReconciliationPage() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try { setResult(await apiJson('/api/admin/retail-reconciliation')); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const links = {
    'Inventory valuation vs inventory asset account': '/admin/retail-inventory-reports',
    'Supplier-tagged payable subledger vs Accounts Payable': '/admin/accounts-payable',
  };
  return <AdminLayout><div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6"><header><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Inventory controls</p><h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Reconciliation</h1><p className="text-sm text-slate-600">Read-only checks against movements and the general ledger. Investigate a difference at its source.</p></header>
    <div className="flex items-center justify-between gap-3"><p role="status" className={`font-semibold ${result?.reconciled ? 'text-emerald-700' : 'text-amber-700'}`}>{busy ? 'Checking…' : result ? result.reconciled ? 'Reconciled' : 'Exception requiring investigation' : 'No result'}</p><button className="rounded-lg border border-slate-300 px-3 py-2 text-sm" disabled={busy} onClick={load}>Run checks</button></div>
    {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {result && <><p className="text-xs text-slate-500">Last checked {new Date(result.generated_at).toLocaleString()}</p><section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">Inventory projection vs movements</h2><p className="mt-1 text-sm">{result.inventoryProjection.reconciled ? 'Reconciled' : `${result.inventoryProjection.differences.length} difference(s)`} across {result.inventoryProjection.checked} variant, location and batch balances.</p>{result.inventoryProjection.differences.length > 0 && <div className="mt-3 space-y-2">{result.inventoryProjection.differences.map((row,i) => <p className="rounded bg-amber-50 p-2 text-sm" key={i}>Variant {row.variant_id}, location {row.location_id}, batch {row.batch_key}: movement {row.ledger_quantity}, balance {row.balance_quantity}, difference {row.difference}. <Link className="text-blue-700 underline" href={`/admin/retail-inventory-movements?variant_id=${row.variant_id}`}>View movements</Link></p>)}</div>}<Link className="mt-3 inline-block text-sm text-blue-700 underline" href="/admin/retail-inventory-movements">Movement Explorer</Link></section>
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Check</th><th className="p-3 text-right">Expected</th><th className="p-3 text-right">Actual</th><th className="p-3 text-right">Difference</th><th className="p-3">Status</th></tr></thead><tbody>{result.checks.map((row) => <tr key={row.name} className="border-t border-slate-100"><td className="p-3">{links[row.name] ? <Link className="text-blue-700 underline" href={links[row.name]}>{row.name}</Link> : row.name}</td><td className="p-3 text-right tabular-nums">{money(row.expected)}</td><td className="p-3 text-right tabular-nums">{money(row.actual)}</td><td className={`p-3 text-right tabular-nums ${row.reconciled ? '' : 'font-semibold text-amber-800'}`}>{money(row.difference)}</td><td className="p-3">{row.reconciled ? 'Reconciled' : 'Investigate'}</td></tr>)}</tbody></table></section></>}
  </div></AdminLayout>;
}
