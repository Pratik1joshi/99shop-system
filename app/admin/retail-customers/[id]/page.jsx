'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';
import { useCapabilities } from '@/lib/use-capabilities';
import CustomerTimeline from '@/components/commerce/customer-timeline';
import WarrantyPurchases from '@/components/erp/warranty-purchases';

const date = (value) => value ? new Date(value).toLocaleString() : '—';

export default function RetailCustomerPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [statement, setStatement] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { can } = useCapabilities();
  const [adjustment, setAdjustment] = useState({ amount: '', reason: '' });
  const [adjustmentError, setAdjustmentError] = useState('');
  const [adjustmentBusy, setAdjustmentBusy] = useState(false);
  const adjustmentKey = useRef(null);
  useEffect(() => { apiJson(`/api/admin/retail-customers/${id}`).then(setData).catch((e) => setError(e.error || e.message)); }, [id]);
  if (error) return <div className="retail-money-page" role="alert">{error}</div>;
  if (!data) return <div className="retail-money-page" role="status">Loading customer…</div>;
  const c = data.customer;
  return <div className="retail-money-page"><header className="retail-money-heading"><div><p className="retail-eyebrow"><Link href="/admin/retail-customers">CUSTOMERS</Link> / #{c.id}</p><h1>{c.name}</h1><p>{c.phone || 'No phone'} · {c.email || 'No email'} · {c.is_blacklisted ? 'Blocked' : c.is_vip ? 'VIP' : 'Active'} · {c.tier} tier</p></div><Link className="retail-money-primary" href={`/admin/retail-receivables?customer_id=${c.id}`}>Collect payment</Link></header>
    <div className="retail-money-metrics"><div><small>Lifetime spend</small><strong>{formatCurrency(c.lifetime_spend)}</strong></div><div><small>Visits</small><strong>{c.visits}</strong></div><div><small>Last purchase</small><strong>{c.last_purchase ? new Date(c.last_purchase).toLocaleDateString() : '—'}</strong></div></div>
    <div className="retail-money-metrics"><div><small>Receivables · customer owes us</small><strong>{formatCurrency(c.ar_due)}</strong><span>{c.open_credit_sales || 0} open sales · {Number(c.credit_limit) > 0 ? `limit ${formatCurrency(c.credit_limit)} · available ${formatCurrency(c.available_credit)}` : 'no set credit limit'}</span></div><div><small>Store credit · we owe customer</small><strong>{formatCurrency(c.store_credit_balance)}</strong></div><div><small>Loyalty · reward points</small><strong>{c.loyalty_points_balance} pts</strong><span>{data.loyalty_rule.enabled ? `Earn 1 point per ${formatCurrency(data.loyalty_rule.earn_rate_amount)} net spend` : 'Program paused'}</span></div></div>
    {Number(c.credit_limit) > 0 && Number(c.ar_due) > Number(c.credit_limit) && <p className="retail-money-error">Customer is over the configured Retail credit limit.</p>}
    {Math.abs(Number(c.ar_projection_difference)) > 0.005 && <p className="retail-money-error" role="alert">Retail sale due and the AR journal differ by {formatCurrency(c.ar_projection_difference)}. Investigate before collecting.</p>}
    <section className="retail-money-card"><h2>Retail credit statement</h2><p>Customer receivables from posted journal entries. Debit increases what the customer owes; credit settles or reduces it.</p><div className="retail-money-form"><label>From<input aria-label="Statement from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>To<input aria-label="Statement to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label><button onClick={() => apiJson(`/api/admin/retail-customers/${id}/statement?${new URLSearchParams({ from, to })}`).then(setStatement).catch((e) => setError(e.error || e.message))}>Show statement</button>{statement && <button onClick={() => window.print()}>Print</button>}</div>{statement && <><p>Opening {formatCurrency(statement.opening_balance)} · Charges {formatCurrency(statement.debit_total)} · Reductions {formatCurrency(statement.credit_total)} · Closing <strong>{formatCurrency(statement.closing_balance)}</strong></p><div className="retail-money-table-wrap"><table className="retail-money-table"><thead><tr><th>Date</th><th>Source</th><th>Journal</th><th>Charge</th><th>Reduction</th><th>Balance</th></tr></thead><tbody>{statement.lines.map((line) => <tr key={`${line.journal_id}-${line.source_type}-${line.source_id}`}><td>{date(line.created_at)}</td><td>{line.source_type.replaceAll('_', ' ')} #{line.source_id}</td><td>#{line.journal_id}</td><td>{formatCurrency(line.debit)}</td><td>{formatCurrency(line.credit)}</td><td>{formatCurrency(line.balance)}</td></tr>)}</tbody></table></div>{statement.truncated && <p>Showing the first 500 of {statement.total_lines} entries. Narrow the date range for a complete printable statement.</p>}</>}</section>
    <CustomerTimeline customerId={id} revision={data} />
    <WarrantyPurchases customerId={id}/>
    <div className="retail-money-columns"><section className="retail-money-card"><h2>Store credit history</h2><p>Issued value and redemptions are tracked separately from cash.</p>{data.store_credit.map((x) => <p key={x.id}>{date(x.created_at)} · {x.type} · {formatCurrency(x.amount)} · balance {formatCurrency(x.balance_after)}</p>)}
      {can('retail_store_credit.adjust') && <form className="retail-money-form" onSubmit={async (event) => {
        event.preventDefault();
        if (adjustmentBusy) return;
        setAdjustmentBusy(true); setAdjustmentError('');
        adjustmentKey.current ||= crypto.randomUUID();
        try {
          await apiJson(`/api/admin/customers/${id}/store-credit/adjust`, { method: 'POST', body: JSON.stringify({
            amount: Number(adjustment.amount), reason: adjustment.reason.trim(), idempotency_key: adjustmentKey.current,
          }) });
          setData(await apiJson(`/api/admin/retail-customers/${id}`));
          setAdjustment({ amount: '', reason: '' }); adjustmentKey.current = null;
        } catch (e) { setAdjustmentError(e.error || e.message); }
        finally { setAdjustmentBusy(false); }
      }}><label>Signed adjustment amount<input aria-label="Store credit adjustment amount" type="number" step="0.01" required value={adjustment.amount} onChange={(event) => { setAdjustment((value) => ({ ...value, amount: event.target.value })); adjustmentKey.current = null; }} /></label><label>Reason<input aria-label="Store credit adjustment reason" required value={adjustment.reason} onChange={(event) => { setAdjustment((value) => ({ ...value, reason: event.target.value })); adjustmentKey.current = null; }} /></label><button disabled={adjustmentBusy} type="submit">Post correction</button>{adjustmentError && <p role="alert">{adjustmentError}</p>}<p>Positive adds credit; negative corrects it. Each post creates a journal and audit transaction.</p></form>}
    </section><section className="retail-money-card"><h2>Loyalty history</h2><p>Reward points are not cash or store credit.</p>{data.loyalty.map((x) => <p key={x.id}>{date(x.created_at)} · {x.type} · {x.points} pts · balance {x.balance_after}</p>)}</section></div>
  </div>;
}
