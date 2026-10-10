import { NextResponse } from 'next/server';
import Database from '@/lib/db/index.js';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { ensureAccountingSchema } from '@/lib/accounting.js';
import { trialBalance } from '@/lib/accounting-reports.js';
import { businessDayContext } from '@/lib/business-days.js';
import { financeVisibility } from '@/lib/retail-finance-visibility.js';
import { isPermissionAllowedSync } from '@/lib/permissions.js';
import { refreshCashClosingConfig,cashClosingPolicy } from '@/lib/cash-closing-policy.js';

const number = (value) => Math.round((Number(value) || 0) * 100) / 100;

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'accountant', 'manager'], permission: 'finance_dashboard.access' });
    if (auth.error) return auth.error;
    const db = Database.getInstance();
    await ensureAccountingSchema(db);
    await refreshCashClosingConfig(db);
    const overdueBefore = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    const [accounts, retail, returns, collections, balance, oldReceivables, overLimit, day] = await Promise.all([
      db.all(`SELECT a.code,a.name,a.type,COALESCE(SUM(jl.debit),0) AS debit,COALESCE(SUM(jl.credit),0) AS credit
        FROM accounts a LEFT JOIN journal_lines jl ON jl.account_id=a.id GROUP BY a.id,a.code,a.name,a.type ORDER BY a.code`),
      db.get(`SELECT COUNT(*) AS count,COALESCE(SUM(grand_total),0) AS sales,COALESCE(SUM(amount_due),0) AS outstanding
        FROM retail_sales WHERE status='COMPLETED'`),
      db.get(`SELECT COUNT(*) AS count,COALESCE(SUM(refund_total),0) AS refunds FROM retail_returns WHERE status='POSTED'`),
      db.get(`SELECT COUNT(*) AS count,COALESCE(SUM(amount),0) AS amount FROM retail_credit_collections`),
      trialBalance(db),
      db.get(`SELECT COUNT(*) AS sale_count,COALESCE(SUM(amount_due),0) AS amount
        FROM retail_sales WHERE status='COMPLETED' AND amount_due>0.005 AND completed_at<?`, [overdueBefore]),
      db.get(`SELECT COUNT(*) AS customer_count FROM (
        SELECT c.id FROM customers c JOIN retail_sales s ON s.customer_id=c.id
        WHERE c.credit_limit>0 AND s.status='COMPLETED' AND s.amount_due>0.005
        GROUP BY c.id,c.credit_limit HAVING SUM(s.amount_due)>c.credit_limit
      ) over_limit_customers`),
      businessDayContext(db),
    ]);
    const byCode = Object.fromEntries(accounts.map((a) => [a.code, a]));
    const asset = (code) => number(Number(byCode[code]?.debit || 0) - Number(byCode[code]?.credit || 0));
    const liability = (code) => number(Number(byCode[code]?.credit || 0) - Number(byCode[code]?.debit || 0));
    return NextResponse.json(financeVisibility({
      retail: { sale_count: Number(retail.count), gross_sales: number(retail.sales),
        open_ar: number(retail.outstanding), return_count: Number(returns.count), refunds: number(returns.refunds),
        collection_count: Number(collections.count), collections: number(collections.amount) },
      control: { cash: asset('1010'), bank: asset('1020'), inventory: asset('1210'),
        accounts_receivable: asset('1300'), accounts_payable: liability('2010'), store_credit_liability: liability('2030') },
      trial_balance: { balanced: balance.balanced, debit: balance.totalDebit, credit: balance.totalCredit },
      attention: { overdue_receivable_sales: Number(oldReceivables.sale_count), overdue_receivable_amount: number(oldReceivables.amount),
        over_limit_customers: Number(overLimit.customer_count), outstanding_payable: liability('2010'),
        stale_register: !!day.isStale && !day.staleAcknowledged },
    },{can:key=>isPermissionAllowedSync(auth.user.role,key),cashVisible:cashClosingPolicy(auth.user).expectedCashVisible}));
  } catch (error) { return handleRouteError(error, 'Could not load Retail finance.'); }
}
