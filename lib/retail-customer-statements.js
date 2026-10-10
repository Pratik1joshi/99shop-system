import { ensureAccountingSchema } from '@/lib/accounting.js';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const TYPES = "'retail_sale','retail_return','retail_credit_collection','retail_credit_writeoff'";
const validDate = (value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value);

export async function retailCustomerStatement(db, { customerId, from = null, to = null }) {
  if (!Number.isInteger(Number(customerId)) || Number(customerId) < 1) throw Object.assign(new Error('Choose a customer.'), { status: 400 });
  if (!validDate(from) || !validDate(to) || (from && to && from > to)) throw Object.assign(new Error('Choose a valid date range.'), { status: 400 });
  await ensureAccountingSchema(db);
  const customer = await db.get(`SELECT id,name,phone FROM customers WHERE id=?`, [customerId]);
  if (!customer) throw Object.assign(new Error('Customer not found.'), { status: 404 });
  const source = `FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id
    JOIN journal_entries je ON je.id=jl.journal_id
    WHERE a.code='1300' AND jl.customer_id=? AND je.source_type IN (${TYPES})`;
  const opening = from ? await db.get(`SELECT COALESCE(SUM(jl.debit-jl.credit),0) AS balance ${source} AND je.entry_date<?`, [customerId, from]) : { balance: 0 };
  const clauses = [];
  const args = [customerId];
  if (from) { clauses.push('je.entry_date>=?'); args.push(from); }
  if (to) { clauses.push('je.entry_date<=?'); args.push(to); }
  const range = clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
  const total = await db.get(`SELECT COUNT(*) AS count,COALESCE(SUM(jl.debit),0) AS debits,COALESCE(SUM(jl.credit),0) AS credits ${source}${range}`, args);
  const rows = await db.all(`SELECT je.id AS journal_id,je.entry_date,je.created_at,je.source_type,je.source_id,
    je.memo,jl.debit,jl.credit ${source}${range} ORDER BY je.entry_date,je.id,jl.id LIMIT 501`, args);
  let balance = round2(opening.balance);
  const lines = rows.slice(0, 500).map((row) => {
    balance = round2(balance + Number(row.debit) - Number(row.credit));
    return { ...row, debit: round2(row.debit), credit: round2(row.credit), balance };
  });
  return { customer, from, to, opening_balance: round2(opening.balance), debit_total: round2(total.debits),
    credit_total: round2(total.credits), closing_balance: round2(Number(opening.balance) + Number(total.debits) - Number(total.credits)),
    lines, truncated: Number(total.count) > lines.length, total_lines: Number(total.count) };
}
