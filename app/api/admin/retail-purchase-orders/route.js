import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { createPurchaseOrder, ensureRetailPurchasingSchema } from '@/lib/retail-purchasing.js';
import { redactRetailCost } from '@/lib/retail-cost-visibility.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_purchasing.po.create' });
    if (auth.error) return auth.error;

    const db = Database.getInstance();
    await ensureRetailPurchasingSchema(db);
    const params = new URL(request.url).searchParams;
    const status = String(params.get('status') || '').toUpperCase();
    const supplierId = Number(params.get('supplier_id')) || null;
    const query = String(params.get('q') || '').trim().slice(0, 120);
    const page = Math.max(1, Math.min(10000, Number(params.get('page')) || 1));
    const size = Math.max(1, Math.min(100, Number(params.get('page_size')) || 40));
    const filters = [];
    const values = [];
    if (status) { filters.push('po.status=?'); values.push(status); }
    if (supplierId) { filters.push('po.supplier_id=?'); values.push(supplierId); }
    if (query) { filters.push('(lower(po.po_number) LIKE ? OR lower(s.name) LIKE ?)'); values.push(`%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const base = `FROM purchase_orders po LEFT JOIN suppliers s ON s.id=po.supplier_id`;
    const total = await db.get(`SELECT COUNT(*) AS total ${base} ${where}`, values);
    const rows = await db.all(
      `SELECT po.*,s.name AS supplier_name,COALESCE(lines.line_count,0) AS line_count,
        COALESCE(lines.ordered_quantity,0) AS ordered_quantity,COALESCE(lines.received_quantity,0) AS received_quantity,
        COALESCE(lines.order_total,0) AS order_total
       ${base} LEFT JOIN (SELECT purchase_order_id,COUNT(*) AS line_count,
         SUM(ordered_quantity) AS ordered_quantity,SUM(quantity_received) AS received_quantity,SUM(net_amount) AS order_total
         FROM purchase_order_lines GROUP BY purchase_order_id) lines ON lines.purchase_order_id=po.id
       ${where} ORDER BY po.id DESC LIMIT ? OFFSET ?`,
      [...values, size, (page - 1) * size]
    );
    return NextResponse.json({ purchase_orders: redactRetailCost(rows, auth.user.role, 'retail_purchasing.view_cost'),
      pagination: { page, page_size: size, total: Number(total?.total || 0), total_pages: Math.max(1, Math.ceil(Number(total?.total || 0) / size)) } });
  } catch (error) {
    return handleRouteError(error, 'Could not load purchase orders.');
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_purchasing.po.create' });
    if (auth.error) return auth.error;
    const costAuth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_purchasing.view_cost' });
    if (costAuth.error) return NextResponse.json({ error: 'Creating a priced purchase order requires cost permission.' }, { status: 403 });

    const data = await request.json();
    const db = Database.getInstance();
    const po = await createPurchaseOrder(db, { ...data, createdBy: auth.user.id });
    return NextResponse.json({ message: 'Purchase order created', purchase_order: redactRetailCost(po, auth.user.role, 'retail_purchasing.view_cost') }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, 'Failed to create purchase order');
  }
}
