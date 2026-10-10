import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { createGoodsReceipt, ensureRetailPurchasingSchema, getPurchaseOrder } from '@/lib/retail-purchasing.js';
import { redactRetailCost } from '@/lib/retail-cost-visibility.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_purchasing.grn.receive' });
    if (auth.error) return auth.error;

    const db = Database.getInstance();
    await ensureRetailPurchasingSchema(db);
    const params = new URL(request.url).searchParams;
    const status = params.get('status');
    const supplierId = Number(params.get('supplier_id'));
    const search = params.get('q')?.trim().slice(0, 100);
    const from = params.get('from');
    const to = params.get('to');
    const page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);
    const pageSize = 25;
    const conditions = [];
    const values = [];
    if (['DRAFT', 'POSTED', 'VOIDED'].includes(status)) { conditions.push('grn.status = ?'); values.push(status); }
    if (Number.isInteger(supplierId) && supplierId > 0) { conditions.push('grn.supplier_id = ?'); values.push(supplierId); }
    if (search) { conditions.push('(LOWER(grn.grn_number) LIKE ? OR LOWER(COALESCE(grn.invoice_number, \'\')) LIKE ? OR LOWER(COALESCE(s.name, \'\')) LIKE ?)'); values.push(...Array(3).fill(`%${search.toLowerCase()}%`)); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(from || '')) { conditions.push('grn.receipt_date >= ?'); values.push(from); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to || '')) { conditions.push('grn.receipt_date <= ?'); values.push(to); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await db.get(`SELECT COUNT(*) AS total FROM goods_receipts grn LEFT JOIN suppliers s ON s.id = grn.supplier_id ${where}`, values);
    const rows = await db.all(
      `SELECT grn.*, s.name AS supplier_name,
              (SELECT COUNT(*) FROM goods_receipt_lines grl WHERE grl.goods_receipt_id = grn.id) AS line_count
       FROM goods_receipts grn
       LEFT JOIN suppliers s ON s.id = grn.supplier_id
       ${where}
       ORDER BY grn.id DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize]
    );
    return NextResponse.json({ goods_receipts: redactRetailCost(rows, auth.user.role, 'retail_purchasing.view_cost'), pagination: { page, page_size: pageSize, total: Number(count?.total || 0) } });
  } catch (error) {
    return handleRouteError(error, 'Could not load goods receipts.');
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_purchasing.grn.receive' });
    if (auth.error) return auth.error;

    const data = await request.json();
    const db = Database.getInstance();
    const costAuth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_purchasing.view_cost' });
    if (costAuth.error) {
      const poId = Number(data.purchaseOrderId ?? data.purchase_order_id);
      if (!poId) return NextResponse.json({ error: 'Direct receiving requires purchase cost permission.' }, { status: 403 });
      const po = await getPurchaseOrder(db, poId);
      if (!po || !['APPROVED','PARTIALLY_RECEIVED'].includes(po.status)) return NextResponse.json({ error: 'Choose an approved purchase order.' }, { status: 409 });
      data.lines = (data.lines || []).map((line) => {
        const poLine = po.lines.find((item) => Number(item.id) === Number(line.purchaseOrderLineId ?? line.purchase_order_line_id) && Number(item.variant_id) === Number(line.variantId ?? line.variant_id));
        if (!poLine) throw Object.assign(new Error('Every received item must match a line on the approved purchase order.'), { status: 403 });
        const ratio = Number(line.quantityReceived ?? line.quantity_received) / Number(poLine.ordered_quantity);
        if (!(ratio > 0)) throw Object.assign(new Error('Received quantity must be positive.'), { status: 400 });
        return { ...line, unitCost: Number(poLine.unit_cost), unit_cost: Number(poLine.unit_cost),
          discountAmount: Number(poLine.discount_amount || 0) * ratio, discount_amount: Number(poLine.discount_amount || 0) * ratio,
          taxAmount: Number(poLine.tax_amount || 0) * ratio, tax_amount: Number(poLine.tax_amount || 0) * ratio };
      });
    }
    const grn = await createGoodsReceipt(db, { ...data, receivedBy: auth.user.id });
    return NextResponse.json({ message: 'Goods receipt created', goods_receipt: redactRetailCost(grn, auth.user.role, 'retail_purchasing.view_cost') }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, 'Failed to create goods receipt');
  }
}
