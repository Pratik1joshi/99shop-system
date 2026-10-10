'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';

const filters = [['all', 'All customers'], ['receivable', 'Has receivable'], ['over_limit', 'Over limit'], ['store_credit', 'Store credit'], ['vip', 'VIP'], ['inactive', 'Inactive']];

export default function RetailCustomersPage() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ customers: [], pagination: {} });
  const [attention, setAttention] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      const requested = new URLSearchParams(window.location.search).get('filter');
      if (filters.some(([value]) => value === requested)) setFilter(requested);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const load = useCallback(async () => {
    try { setData(await apiJson(`/api/admin/retail-customers?${new URLSearchParams({ q, filter, page: String(page) })}`)); setError(''); }
    catch (e) { setError(e.error || e.message); }
  }, [q, filter, page]);
  useEffect(() => { const t = setTimeout(load, 220); return () => clearTimeout(t); }, [load]);
  useEffect(() => { apiJson('/api/admin/retail-customers?view=attention').then(setAttention).catch(() => {}); }, []);
  return <div className="retail-money-page"><header className="retail-money-heading"><div><p className="retail-eyebrow">CUSTOMERS</p><h1>Customer command center</h1><p>Retail sales, customer debt, store credit and reward points in separate balances.</p></div><Link className="retail-money-primary" href="/admin/customers">Add or edit customer</Link></header>
    {attention && <section className="retail-money-card" aria-label="Customer money attention"><h2>Customer money attention</h2><p>Top 10 in each list. Open a customer to inspect the source transactions.</p><div className="retail-money-columns">{[
      ['Outstanding receivables', attention.outstanding],
      ['Over credit limit', attention.over_limit],
      [`Balances older than ${attention.old_balance_days} days`, attention.old_balances],
      ['Largest store credit balances', attention.largest_store_credit],
    ].map(([title, rows]) => <div key={title}><h3>{title}</h3>{rows.length ? <ol>{rows.map((row) => <li key={row.id}><Link href={`/admin/retail-customers/${row.id}`}>{row.name}</Link> · {formatCurrency(row.amount)}</li>)}</ol> : <p>No items</p>}</div>)}</div></section>}
    <div className="retail-money-toolbar"><input aria-label="Search customers" placeholder="Search name, phone or customer ID" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /><select aria-label="Customer filter" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>{filters.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span>{data.pagination.total || 0} customers</span></div>
    {error && <p role="alert" className="retail-money-error">{error}</p>}
    <div className="retail-money-table-wrap"><table className="retail-money-table"><thead><tr><th>Customer</th><th>Phone</th><th>Last purchase</th><th>Lifetime spend</th><th>Visits</th><th>AR due</th><th>Store credit</th><th>Loyalty</th><th>Status</th></tr></thead><tbody>{data.customers.map((customer) => <tr key={customer.id}><td><Link href={`/admin/retail-customers/${customer.id}`}>{customer.name}</Link><small>#{customer.id}</small></td><td>{customer.phone || '—'}</td><td>{customer.last_purchase ? new Date(customer.last_purchase).toLocaleDateString() : '—'}</td><td>{formatCurrency(customer.lifetime_spend)}</td><td>{customer.visits}</td><td><Link href={`/admin/retail-receivables?customer_id=${customer.id}`}>{formatCurrency(customer.ar_due)}</Link></td><td>{formatCurrency(customer.store_credit_balance)}</td><td>{customer.loyalty_points_balance} pts</td><td>{customer.is_blacklisted ? 'Blocked' : customer.is_vip ? 'VIP' : 'Active'}</td></tr>)}</tbody></table>{!data.customers.length && <p className="retail-money-empty">No customer matches this search.</p>}</div>
    <div className="retail-money-pager"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {data.pagination.total_pages || 1}</span><button disabled={page >= (data.pagination.total_pages || 1)} onClick={() => setPage(page + 1)}>Next</button></div>
  </div>;
}
