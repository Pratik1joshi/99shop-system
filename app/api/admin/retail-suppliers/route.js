import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard';
import { ensureRetailPurchasingSchema } from '@/lib/retail-purchasing';
import { ensureAccountingSchema } from '@/lib/accounting';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'suppliers.view' });
    if (auth.error) return auth.error;
    const cost = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_purchasing.view_cost' });
    if (cost.error) return cost.error;
    const db = Database.getInstance();
    await ensureRetailPurchasingSchema(db);
    await ensureAccountingSchema(db);
    const params = new URL(request.url).searchParams;
    const q = String(params.get('q') || '').trim().slice(0, 100).toLowerCase();
    const filter = String(params.get('filter') || 'all');
    const page = Math.max(1, Math.min(10000, Number(params.get('page')) || 1));
    const size = Math.max(1, Math.min(100, Number(params.get('page_size')) || 40));
    const account = await db.get(`SELECT id FROM accounts WHERE code='2010'`);
    const base = `FROM suppliers s
      LEFT JOIN (SELECT supplier_id,COUNT(*) AS open_pos FROM purchase_orders WHERE status IN ('APPROVED','PARTIALLY_RECEIVED','PENDING_APPROVAL') GROUP BY supplier_id) po ON po.supplier_id=s.id
      LEFT JOIN (SELECT grn.supplier_id,MAX(grn.posted_at) AS last_receipt,
        SUM(CASE WHEN grn.posted_at>=? THEN grl.net_amount ELSE 0 END) AS recent_spend
        FROM goods_receipts grn JOIN goods_receipt_lines grl ON grl.goods_receipt_id=grn.id
        WHERE grn.status='POSTED' GROUP BY grn.supplier_id) grn ON grn.supplier_id=s.id
      LEFT JOIN (SELECT supplier_id,SUM(credit-debit) AS outstanding FROM journal_lines WHERE account_id=? GROUP BY supplier_id) ap ON ap.supplier_id=s.id`;
    const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const values = [since, account?.id || -1];
    const where = [];
    if (q) { where.push('(lower(s.name) LIKE ? OR lower(COALESCE(s.phone,\'\')) LIKE ? OR lower(COALESCE(s.email,\'\')) LIKE ?)'); values.push(...Array(3).fill(`%${q}%`)); }
    if (filter === 'outstanding') where.push('COALESCE(ap.outstanding,0)>0.009');
    if (filter === 'orders') where.push('COALESCE(po.open_pos,0)>0');
    if (filter === 'inactive') where.push('COALESCE(s.is_archived,0)=1');
    else where.push('COALESCE(s.is_archived,0)=0');
    const clause = `WHERE ${where.join(' AND ')}`;
    const count = await db.get(`SELECT COUNT(*) AS total ${base} ${clause}`, values);
    const rows = await db.all(`SELECT s.id,s.name,s.phone,s.email,s.is_archived,COALESCE(po.open_pos,0) AS open_pos,
      COALESCE(ap.outstanding,0) AS outstanding,grn.last_receipt,COALESCE(grn.recent_spend,0) AS recent_spend
      ${base} ${clause} ORDER BY s.name,s.id LIMIT ? OFFSET ?`, [...values, size, (page - 1) * size]);
    return NextResponse.json({ suppliers: rows, pagination: { page, page_size: size,
      total: Number(count?.total || 0), total_pages: Math.max(1, Math.ceil(Number(count?.total || 0) / size)) },
      ageing_note: 'Overdue totals are unavailable because retail receipts do not store due dates.' });
  } catch (error) { return handleRouteError(error, 'Could not load retail suppliers.'); }
}
