import { NextResponse } from 'next/server';
import Database from '@/lib/db/index.js';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { collectRetailCredits, ensureRetailCreditCollectionsSchema, getRetailCollection, writeOffRetailCredit } from '@/lib/retail-receivables.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'accountant'], permission: 'customer_ledger.access' });
    if (auth.error) return auth.error;
    const db = Database.getInstance();
    await ensureRetailCreditCollectionsSchema(db);
    const params = new URL(request.url).searchParams;
    if (params.get('collection_id')) return NextResponse.json({ collection: await getRetailCollection(db, params.get('collection_id')) });
    const q = String(params.get('q') || '').trim().slice(0, 100).toLowerCase();
    const customerId = Number(params.get('customer_id')) || null;
    const page = Math.max(1, Math.min(10000, Number(params.get('page')) || 1));
    const size = Math.max(1, Math.min(100, Number(params.get('page_size')) || 40));
    const where = [`s.status='COMPLETED'`, 's.amount_due>0.005'];
    const values = [];
    if (customerId) { where.push('s.customer_id=?'); values.push(customerId); }
    if (q) { where.push(`(lower(s.sale_number) LIKE ? OR lower(c.name) LIKE ? OR lower(COALESCE(c.phone,'')) LIKE ?)`);
      values.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    const from = `FROM retail_sales s JOIN customers c ON c.id=s.customer_id`;
    const filter = where.join(' AND ');
    const total = await db.get(`SELECT COUNT(*) AS n,COALESCE(SUM(s.amount_due),0) AS outstanding ${from} WHERE ${filter}`, values);
    const rows = await db.all(`SELECT s.id,s.sale_number,s.customer_id,c.name AS customer_name,c.phone,
      s.completed_at,s.grand_total,s.amount_due,
      COALESCE(col.collected,0) AS collected,COALESCE(ret.returned,0) AS returned,
      COALESCE(wo.written_off,0) AS written_off
      ${from}
      LEFT JOIN (SELECT retail_sale_id,SUM(amount) AS collected FROM retail_credit_collection_allocations GROUP BY retail_sale_id) col ON col.retail_sale_id=s.id
      LEFT JOIN (SELECT original_sale_id,SUM(refund_total) AS returned FROM retail_returns WHERE status='POSTED' AND refund_method='ar_reduction' GROUP BY original_sale_id) ret ON ret.original_sale_id=s.id
      LEFT JOIN (SELECT retail_sale_id,SUM(amount) AS written_off FROM retail_credit_writeoffs GROUP BY retail_sale_id) wo ON wo.retail_sale_id=s.id
      WHERE ${filter} ORDER BY s.completed_at ASC,s.id ASC LIMIT ? OFFSET ?`, [...values, size, (page - 1) * size]);
    return NextResponse.json({ receivables: rows.map((row) => ({ ...row,
      original_credit: Number(row.amount_due) + Number(row.collected) + Number(row.returned) + Number(row.written_off) })),
      pagination: { page, page_size: size, total: Number(total.n), total_pages: Math.max(1, Math.ceil(Number(total.n) / size)) },
      summary: { outstanding: Number(total.outstanding), open_sales: Number(total.n) } });
  } catch (error) { return handleRouteError(error, 'Could not load retail receivables.'); }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'accountant'], permission: 'customer_ledger.access' });
    if (auth.error) return auth.error;
    const data = await request.json();
    const collection = await collectRetailCredits(Database.getInstance(), { customerId: data.customer_id,
      allocations: data.allocations, method: data.method, bankAccountId: data.bank_account_id,
      reference: data.reference, actorId: auth.user.id, externalRef: data.external_ref });
    return NextResponse.json({ collection }, { status: 201 });
  } catch (error) { return handleRouteError(error, 'Could not collect customer credit.'); }
}

export async function PATCH(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'accountant'], permission: 'credit.writeoff' });
    if (auth.error) return auth.error;
    const data = await request.json();
    const result = await writeOffRetailCredit(Database.getInstance(), { saleId: data.sale_id, amount: data.amount,
      reason: data.reason, actorId: auth.user.id, externalRef: data.external_ref });
    return NextResponse.json({ writeoff: result });
  } catch (error) { return handleRouteError(error, 'Could not write off retail credit.'); }
}
