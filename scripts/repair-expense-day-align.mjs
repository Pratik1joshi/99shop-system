/**
 * One-shot: re-attach mis-tagged expenses on the local SQLite DB.
 * Usage: node --import ./tests/unit/loader-register.mjs scripts/repair-expense-day-align.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
delete process.env.DATABASE_URL;
process.chdir(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));

const { default: Database } = await import('../lib/db/index.js');
const { repairExpenseBusinessDayAlignment } = await import('../lib/expense-links.js');
const { buildSummaryReport } = await import('../lib/summary-report.js');
const { nepalDateString } = await import('../lib/report-dates.js');

const db = Database.getInstance();
const fixed = await repairExpenseBusinessDayAlignment(db);
const yesterday = (() => {
  const d = new Date(`${nepalDateString()}T12:00:00+05:45`);
  d.setDate(d.getDate() - 1);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
})();
const summary = await buildSummaryReport(db, { start: yesterday, end: yesterday });
const mismatch = await db.all(
  `SELECT e.id, e.description, e.amount,
          COALESCE(e.purchase_date, CAST(e.expense_date AS TEXT)) AS expense_on,
          bd.business_date AS tagged_day
   FROM expenses e
   LEFT JOIN business_days bd ON bd.id = e.business_day_id
   WHERE LOWER(COALESCE(e.status,'active'))<>'voided'
     AND e.description LIKE '%fdbdrfbdfb%'`
);
console.log(JSON.stringify({
  fixed,
  yesterday,
  expense_cash: summary.expenses.cash,
  expense_total: summary.expenses.total,
  cash_expense_credit: summary.accounts.cash.movements.expense?.credit || 0,
  sample: mismatch,
}, null, 2));
process.exit(0);
