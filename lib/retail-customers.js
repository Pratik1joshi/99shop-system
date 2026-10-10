import { ensureRetailLoyaltySchema, getLoyaltySettings } from '@/lib/retail-loyalty.js';
import { ensureRetailCreditCollectionsSchema } from '@/lib/retail-receivables.js';
import { ensureStoreCreditSchema } from '@/lib/retail-store-credit.js';

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const limit = (value, fallback, maximum) => Math.min(maximum, Math.max(1, Number.parseInt(value, 10) || fallback));

export async function listRetailCustomers(db, { q = '', filter = 'all', page = 1, pageSize = 30 } = {}) {
  await ensureRetailLoyaltySchema(db);
  await ensureStoreCreditSchema(db);
  const number = limit(page, 1, 100000);
  const size = limit(pageSize, 30, 100);
  const where = [];
  const args = [];
  const search = String(q).trim().slice(0, 100).toLowerCase();
  if (search) {
    where.push(`(lower(c.name) LIKE ? OR lower(COALESCE(c.phone,'')) LIKE ? OR CAST(c.id AS TEXT) LIKE ?)`);
    args.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (filter === 'vip') where.push('c.is_vip=1');
  if (filter === 'store_credit') where.push('c.store_credit_balance>0');
  if (filter === 'receivable' || filter === 'over_limit') {
    const exposure = `(SELECT COALESCE(SUM(s.amount_due),0) FROM retail_sales s WHERE s.customer_id=c.id AND s.status='COMPLETED')`;
    where.push(filter === 'receivable' ? `${exposure}>0.005` : `c.credit_limit>0 AND ${exposure}>c.credit_limit`);
  }
  if (filter === 'inactive') where.push(`NOT EXISTS (SELECT 1 FROM retail_sales s WHERE s.customer_id=c.id AND s.status='COMPLETED' AND s.completed_at>=?)`), args.push(new Date(Date.now() - 180 * 86400000).toISOString());
  const predicate = where.length ? where.join(' AND ') : '1=1';
  const count = await db.get(`SELECT COUNT(*) AS count FROM customers c WHERE ${predicate}`, args);
  const rows = await db.all(`SELECT c.id,c.name,c.phone,c.email,c.is_vip,c.is_blacklisted,c.credit_limit,
    c.store_credit_balance,c.loyalty_points_balance,
    COALESCE(s.visits,0) AS visits,COALESCE(s.lifetime_spend,0) AS lifetime_spend,s.last_purchase,
    COALESCE(s.ar_due,0) AS ar_due
    FROM customers c
    LEFT JOIN (SELECT customer_id,COUNT(*) AS visits,SUM(grand_total) AS lifetime_spend,
      MAX(completed_at) AS last_purchase,SUM(amount_due) AS ar_due
      FROM retail_sales WHERE status='COMPLETED' AND customer_id IS NOT NULL GROUP BY customer_id) s ON s.customer_id=c.id
    WHERE ${predicate} ORDER BY c.name,c.id LIMIT ? OFFSET ?`, [...args, size, (number - 1) * size]);
  return { customers: rows.map((row) => ({ ...row, lifetime_spend: money(row.lifetime_spend), ar_due: money(row.ar_due),
    store_credit_balance: money(row.store_credit_balance), loyalty_points_balance: money(row.loyalty_points_balance),
    credit_limit: money(row.credit_limit) })),
    pagination: { page: number, page_size: size, total: Number(count.count), total_pages: Math.max(1, Math.ceil(Number(count.count) / size)) } };
}

/** Bounded worklists from posted Retail obligations and customer balances. */
export async function retailCustomerAttention(db) {
  await ensureRetailLoyaltySchema(db);
  await ensureStoreCreditSchema(db);
  const overdueBefore = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const [outstanding, overLimit, oldBalances, storeCredit] = await Promise.all([
    db.all(`SELECT c.id,c.name,COALESCE(SUM(s.amount_due),0) AS amount,COUNT(*) AS sale_count
      FROM retail_sales s JOIN customers c ON c.id=s.customer_id
      WHERE s.status='COMPLETED' AND s.amount_due>0.005
      GROUP BY c.id,c.name ORDER BY amount DESC,c.id LIMIT 10`),
    db.all(`SELECT c.id,c.name,c.credit_limit,COALESCE(SUM(s.amount_due),0) AS amount
      FROM retail_sales s JOIN customers c ON c.id=s.customer_id
      WHERE s.status='COMPLETED' AND s.amount_due>0.005 AND c.credit_limit>0
      GROUP BY c.id,c.name,c.credit_limit HAVING SUM(s.amount_due)>c.credit_limit
      ORDER BY amount DESC,c.id LIMIT 10`),
    db.all(`SELECT c.id,c.name,COALESCE(SUM(s.amount_due),0) AS amount,MIN(s.completed_at) AS oldest_at
      FROM retail_sales s JOIN customers c ON c.id=s.customer_id
      WHERE s.status='COMPLETED' AND s.amount_due>0.005 AND s.completed_at<?
      GROUP BY c.id,c.name ORDER BY oldest_at,c.id LIMIT 10`, [overdueBefore]),
    db.all(`SELECT id,name,store_credit_balance AS amount FROM customers
      WHERE store_credit_balance>0.005 ORDER BY store_credit_balance DESC,id LIMIT 10`),
  ]);
  const normalized = (rows) => rows.map((row) => ({ ...row, amount: money(row.amount) }));
  return { outstanding: normalized(outstanding), over_limit: normalized(overLimit),
    old_balances: normalized(oldBalances), largest_store_credit: normalized(storeCredit),
    old_balance_days: 30, per_worklist_limit: 10 };
}

export async function getRetailCustomer(db, customerId, { includePrivate = false } = {}) {
  await ensureRetailLoyaltySchema(db);
  await ensureStoreCreditSchema(db);
  await ensureRetailCreditCollectionsSchema(db);
  const customer = await db.get(`SELECT id,name,phone,email,address,is_vip,is_blacklisted,credit_limit,loyalty_tier_override,
    store_credit_balance,loyalty_points_balance${includePrivate ? ',notes' : ''} FROM customers WHERE id=?`, [customerId]);
  if (!customer) return null;
  const summary = await db.get(`SELECT COUNT(*) AS visits,COALESCE(SUM(grand_total),0) AS lifetime_spend,
    MAX(completed_at) AS last_purchase,COALESCE(SUM(amount_due),0) AS ar_due,
    SUM(CASE WHEN amount_due>0.005 THEN 1 ELSE 0 END) AS open_credit_sales
    FROM retail_sales WHERE customer_id=? AND status='COMPLETED'`, [customerId]);
  const journalAr = await db.get(`SELECT COALESCE(SUM(jl.debit-jl.credit),0) AS amount
    FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id
    JOIN journal_entries je ON je.id=jl.journal_id
    WHERE a.code='1300' AND jl.customer_id=?
      AND je.source_type IN ('retail_sale','retail_return','retail_credit_collection','retail_credit_writeoff')`, [customerId]);
  const sales = await db.all(`SELECT id,sale_number,completed_at,grand_total,amount_paid,amount_due
    FROM retail_sales WHERE customer_id=? AND status='COMPLETED' ORDER BY completed_at DESC,id DESC LIMIT 30`, [customerId]);
  const returns = await db.all(`SELECT id,return_number,original_sale_id,posted_at,refund_total,refund_method
    FROM retail_returns WHERE customer_id=? AND status='POSTED' ORDER BY posted_at DESC,id DESC LIMIT 30`, [customerId]);
  const collections = await db.all(`SELECT id,collection_number,created_at,amount,method,payment_reference
    FROM retail_credit_collections WHERE customer_id=? ORDER BY id DESC LIMIT 30`, [customerId]);
  const storeCredit = await db.all(`SELECT id,type,amount,balance_after,source_type,source_id,reason,created_at
    FROM store_credit_transactions WHERE customer_id=? ORDER BY id DESC LIMIT 30`, [customerId]);
  const loyalty = await db.all(`SELECT id,type,points,balance_after,source_type,source_id,reason,created_at
    FROM loyalty_transactions WHERE customer_id=? ORDER BY id DESC LIMIT 30`, [customerId]);
  const rules = await getLoyaltySettings(db);
  const tier = customer.loyalty_tier_override || [...rules.tiers].reverse()
    .find((entry) => Number(summary.lifetime_spend) >= entry.threshold)?.name || 'STANDARD';
  const ar = money(journalAr.amount);
  return { customer: { ...customer, ...summary, tier, ar_due: ar,
    ar_projection_difference: money(Number(summary.ar_due) - ar),
    credit_limit: money(customer.credit_limit), available_credit: Math.max(0, money(customer.credit_limit) - ar),
    store_credit_balance: money(customer.store_credit_balance), loyalty_points_balance: money(customer.loyalty_points_balance),
    lifetime_spend: money(summary.lifetime_spend) }, sales, returns, collections, store_credit: storeCredit, loyalty,
    loyalty_rule: { enabled: rules.enabled, earn_rate_amount: rules.earnRateAmount,
      points_per_currency: rules.pointsPerCurrency, redeem_max_percent: rules.redeemMaxPercent } };
}
