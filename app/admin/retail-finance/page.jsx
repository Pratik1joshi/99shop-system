'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiJson } from '@/lib/authed-fetch';
import { formatCurrency } from '@/lib/currency';
import { useCapabilities } from '@/lib/use-capabilities';

const visibleMoney = value => value == null ? 'Restricted' : formatCurrency(value);

const sections = [
  ['Registers & Cash', '/admin/retail-registers', 'Business day controls, register custody, counts and cash movements together.', 'business_days.view'],
  ['Expenses', '/admin/expenses', 'Record and inspect operating expenses.', 'expenses.manage'],
  ['Banks', '/admin/bank', 'Accounts and settlement movements.', 'bank.access'],
  ['Bank reconciliation', '/admin/bank-reconciliation', 'Match bank statement lines and finalize reconciliation.', 'bank_reconciliation.access'],
  ['Chart of accounts', '/admin/chart-of-accounts', 'Financial account structure and balances.', 'chart_of_accounts.access'],
  ['Journal & general ledger', '/admin/general-ledger', 'Trace each posting to its journal and account.', 'general_ledger.view'],
  ['Financial statements', '/admin/financial-reports', 'Trial balance, profit and loss, balance sheet and cash flow.', 'financial_reports.access'],
  ['Retail reconciliation', '/admin/retail-reconciliation', 'Check operational projections against source ledgers.', 'general_ledger.view'],
];

export default function RetailFinancePage() {
  const { can } = useCapabilities();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { apiJson('/api/admin/retail-finance').then(setData).catch((e) => setError(e.error || e.message)); }, []);
  return <div className="retail-money-page"><header className="retail-money-heading"><div><p className="retail-eyebrow">FINANCE</p><h1>Money and accounts</h1><p>Retail activity alongside the posted general ledger.</p></div></header>
    {error && <p role="alert" className="retail-money-error">{error}</p>}
    {!data ? <p role="status">Loading finance…</p> : <><div className="retail-money-metrics"><div><small>Retail sales · completed</small><strong>{formatCurrency(data.retail.gross_sales)}</strong><span>{data.retail.sale_count} sales</span></div><div><small>Open Retail receivables</small><strong><Link href="/admin/retail-receivables">{formatCurrency(data.retail.open_ar)}</Link></strong><span>{formatCurrency(data.retail.collections)} collected</span></div><div><small>Retail returns</small><strong>{formatCurrency(data.retail.refunds)}</strong><span>{data.retail.return_count} posted returns</span></div></div>
      <div className="retail-money-metrics"><div><small>Cash · GL</small><strong>{visibleMoney(data.control.cash)}</strong></div><div><small>Bank · GL</small><strong>{visibleMoney(data.control.bank)}</strong></div><div><small>Inventory asset · GL</small><strong>{visibleMoney(data.control.inventory)}</strong></div></div>
      <div className="retail-money-metrics"><div><small>Accounts receivable · GL</small><strong>{visibleMoney(data.control.accounts_receivable)}</strong></div><div><small>Accounts payable · GL</small><strong>{visibleMoney(data.control.accounts_payable)}</strong></div><div><small>Store credit liability · GL</small><strong>{visibleMoney(data.control.store_credit_liability)}</strong></div></div>{data.trial_balance && <p role="status">Trial balance: {data.trial_balance.balanced ? 'Balanced' : 'Needs attention'} · Debit {formatCurrency(data.trial_balance.debit)} · Credit {formatCurrency(data.trial_balance.credit)}</p>}</>}
    {data?.attention && <section className="retail-money-card" aria-label="Financial attention"><h2>Financial attention</h2><p>Posted obligations and control exceptions that need review.</p><div className="retail-money-link-grid">
      {data.trial_balance && !data.trial_balance.balanced && <Link href="/admin/financial-reports"><strong>Trial balance needs attention</strong><span>Debit and credit totals differ.</span></Link>}
      {data.attention.stale_register && <Link href="/admin/business-days"><strong>Previous day register is open</strong><span>Continue or close the stale business day.</span></Link>}
      {data.attention.overdue_receivable_sales > 0 && <Link href="/admin/retail-receivables"><strong>{data.attention.overdue_receivable_sales} old receivable sales</strong><span>{formatCurrency(data.attention.overdue_receivable_amount)} remains due after 30 days.</span></Link>}
      {data.attention.over_limit_customers > 0 && <Link href="/admin/retail-customers?filter=over_limit"><strong>{data.attention.over_limit_customers} customers over limit</strong><span>Review their source sales and collection history.</span></Link>}
      {data.attention.outstanding_payable > 0 && <Link href="/admin/accounts-payable"><strong>Outstanding payables</strong><span>{formatCurrency(data.attention.outstanding_payable)} in the posted GL.</span></Link>}
      {can('general_ledger.view') && <Link href="/admin/retail-reconciliation"><strong>Run reconciliation</strong><span>Check Retail projections against posted ledgers.</span></Link>}
    </div></section>}
    <div className="retail-money-link-grid">{sections.filter(([, , , permission]) => can(permission)).map(([label, href, description]) => <Link key={href} href={href}><strong>{label}</strong><span>{description}</span></Link>)}</div>
  </div>;
}
