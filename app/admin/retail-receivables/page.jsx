'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiJson } from '@/lib/authed-fetch';
import { useCapabilities } from '@/lib/use-capabilities';
import { formatCurrency } from '@/lib/currency';

const key = () => crypto.randomUUID();
const amount = (value) => Number(value || 0).toFixed(2);

export default function RetailReceivablesPage() {
  const searchParams = useSearchParams();
  const { can } = useCapabilities();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ receivables: [], pagination: {}, summary: {} });
  const [allocations, setAllocations] = useState({});
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [writeoff, setWriteoff] = useState(null);
  const [reason, setReason] = useState('');
  const [writeoffAmount, setWriteoffAmount] = useState('');
  const [customerId, setCustomerId] = useState(searchParams.get('customer_id') || null);
  useEffect(() => {
    const collectionId = searchParams.get('collection');
    if (collectionId) apiJson(`/api/admin/retail-receivables?collection_id=${encodeURIComponent(collectionId)}`)
      .then((result) => setReceipt(result.collection)).catch((e) => setError(e.error || e.message));
  }, [searchParams]);
  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ page: String(page), q: query });
      if (customerId) p.set('customer_id', String(customerId));
      setData(await apiJson(`/api/admin/retail-receivables?${p}`));
      setError('');
    } catch (e) { setError(e.error || e.message); }
  }, [page, query, customerId]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  const selected = data.receivables.filter((row) => Number(allocations[row.id]) > 0);
  const selectedCustomers = [...new Set(selected.map((row) => row.customer_id))];
  const total = selected.reduce((sum, row) => sum + Number(allocations[row.id]), 0);
  const collect = async () => {
    if (!selected.length || selectedCustomers.length !== 1) { setError('Select open sales from one customer.'); return; }
    if (selected.some((row) => Number(allocations[row.id]) > Number(row.amount_due) + 0.005)) { setError('An allocation exceeds its outstanding amount.'); return; }
    setBusy(true); setError('');
    try {
      const result = await apiJson('/api/admin/retail-receivables', { method: 'POST', body: JSON.stringify({
        customer_id: selectedCustomers[0], method, reference, external_ref: key(),
        allocations: selected.map((row) => ({ sale_id: row.id, amount: Number(allocations[row.id]) })),
      }) });
      setReceipt(result.collection); setAllocations({}); await load();
    } catch (e) { setError(e.error || e.message); } finally { setBusy(false); }
  };
  const postWriteoff = async () => {
    setBusy(true); setError('');
    try {
      await apiJson('/api/admin/retail-receivables', { method: 'PATCH', body: JSON.stringify({
        sale_id: writeoff.id, amount: Number(writeoffAmount), reason, external_ref: key(),
      }) });
      setWriteoff(null); setReason(''); setWriteoffAmount(''); await load();
    } catch (e) { setError(e.error || e.message); } finally { setBusy(false); }
  };
  return <div className="retail-money-page">
    <header className="retail-money-heading"><div><p className="retail-eyebrow">CUSTOMER MONEY</p><h1>Receivables</h1><p>Outstanding Retail sales, collections, returns, and write-offs.</p></div><strong>{formatCurrency(data.summary.outstanding || 0)} due</strong></header>
    <div className="retail-money-toolbar"><input aria-label="Search receivables" placeholder="Search customer, phone or sale number" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} /><input aria-label="Customer ID filter" type="number" min="1" placeholder="Customer ID" value={customerId || ''} onChange={(e) => { setCustomerId(e.target.value || null); setPage(1); }} /><span>{data.summary.open_sales || 0} open sales</span></div>
    {error && <p role="alert" className="retail-money-error">{error}</p>}
    <div className="retail-money-table-wrap"><table className="retail-money-table"><thead><tr><th>Customer / source</th><th>Outstanding since</th><th>Original credit</th><th>Collected</th><th>Returned</th><th>Written off</th><th>Due</th><th>Allocate</th><th>Action</th></tr></thead><tbody>{data.receivables.map((row) => <tr key={row.id}><td><Link href={`/admin/retail-customers/${row.customer_id}`}>{row.customer_name}</Link><small>{row.sale_number}</small></td><td>{row.completed_at ? new Date(row.completed_at).toLocaleDateString() : '—'}</td><td>{formatCurrency(row.original_credit)}</td><td>{formatCurrency(row.collected)}</td><td>{formatCurrency(row.returned)}</td><td>{formatCurrency(row.written_off)}</td><td><strong>{formatCurrency(row.amount_due)}</strong></td><td><input aria-label={`Allocate ${row.sale_number}`} type="number" min="0" max={row.amount_due} step="0.01" value={allocations[row.id] ?? ''} onChange={(e) => setAllocations((current) => ({ ...current, [row.id]: e.target.value }))} /></td><td>{can('credit.writeoff') && <button type="button" onClick={() => { setWriteoff(row); setWriteoffAmount(amount(row.amount_due)); }}>Write off</button>}</td></tr>)}</tbody></table>{!data.receivables.length && <p className="retail-money-empty">No open Retail receivables match this search.</p>}</div>
    <div className="retail-money-pager"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {data.pagination.total_pages || 1}</span><button disabled={page >= (data.pagination.total_pages || 1)} onClick={() => setPage(page + 1)}>Next</button></div>
    <section className="retail-money-card"><h2>Collect payment</h2><p>Enter an amount in one or more sales from the same customer. The payment settles receivables; it does not create another sale.</p><div className="retail-money-form"><label>Payment method<select value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">Cash</option><option value="online">Bank / online</option></select></label><label>Reference<input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional payment reference" /></label><strong>Total {formatCurrency(total)}</strong><button disabled={busy || !total} onClick={collect}>Post collection</button></div>{selectedCustomers.length > 1 && <p role="alert">Choose sales from one customer only.</p>}</section>
    {receipt && <section className="retail-money-card retail-collection-receipt" aria-label="Collection receipt"><h2>Collection {receipt.collectionNumber}</h2><p>{receipt.customer_name} · {formatCurrency(receipt.amount)} received by {receipt.method}{receipt.payment_reference ? ` · ${receipt.payment_reference}` : ''}. Journal #{receipt.journalId}.</p><ul>{receipt.allocations.map((row) => <li key={row.sale_id}>{row.sale_number}: {formatCurrency(row.amount)} paid · {formatCurrency(row.remaining)} remains</li>)}</ul><p>Customer receivables remaining: {formatCurrency(receipt.outstanding)}</p><button onClick={() => window.print()}>Print receipt</button><Link href={`/admin/retail-customers/${receipt.customerId}`}>View customer</Link></section>}
    {writeoff && <section className="retail-money-card"><h2>Write off {writeoff.sale_number}</h2><p>This posts a bad debt expense and reduces customer receivables.</p><div className="retail-money-form"><label>Amount<input type="number" min="0.01" max={writeoff.amount_due} step="0.01" value={writeoffAmount} onChange={(e) => setWriteoffAmount(e.target.value)} /></label><label>Reason<input value={reason} onChange={(e) => setReason(e.target.value)} /></label><button disabled={busy || !reason.trim()} onClick={postWriteoff}>Post write-off</button><button onClick={() => setWriteoff(null)}>Cancel</button></div></section>}
  </div>;
}
