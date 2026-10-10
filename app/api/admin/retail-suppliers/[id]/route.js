import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard';
import { ensureRetailPurchasingSchema } from '@/lib/retail-purchasing';
import { ensureAccountingSchema } from '@/lib/accounting';
import { supplierOpenInvoices, supplierStatement } from '@/lib/accounting-suppliers';

export async function GET(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'suppliers.view' });
    if (auth.error) return auth.error;
    const cost = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_purchasing.view_cost' });
    if (cost.error) return cost.error;
    const { id } = await context.params;
    const supplierId = Number(id);
    if (!Number.isInteger(supplierId) || supplierId < 1) return NextResponse.json({ error: 'Invalid supplier.' }, { status: 400 });
    const db = Database.getInstance();
    await ensureRetailPurchasingSchema(db);
    await ensureAccountingSchema(db);
    const supplier = await db.get(`SELECT * FROM suppliers WHERE id=?`, [supplierId]);
    if (!supplier) return NextResponse.json({ error: 'Supplier not found.' }, { status: 404 });
    const [orders, receipts, returns, invoices, statement, products] = await Promise.all([
      db.all(`SELECT po.id,po.po_number,po.order_date,po.status,po.expected_date,
        COUNT(pol.id) AS line_count,COALESCE(SUM(pol.net_amount),0) AS order_total
        FROM purchase_orders po LEFT JOIN purchase_order_lines pol ON pol.purchase_order_id=po.id
        WHERE po.supplier_id=? GROUP BY po.id ORDER BY po.id DESC LIMIT 100`, [supplierId]),
      db.all(`SELECT grn.id,grn.grn_number,grn.invoice_number,grn.receipt_date,grn.posted_at,grn.status,
        COALESCE(SUM(grl.net_amount),0) AS total FROM goods_receipts grn
        LEFT JOIN goods_receipt_lines grl ON grl.goods_receipt_id=grn.id
        WHERE grn.supplier_id=? GROUP BY grn.id ORDER BY grn.id DESC LIMIT 100`, [supplierId]),
      db.all(`SELECT pr.id,pr.return_number,pr.goods_receipt_id,pr.return_date,pr.status,pr.reason,
        COALESCE(SUM(prl.net_amount),0) AS total FROM purchase_returns pr
        LEFT JOIN purchase_return_lines prl ON prl.purchase_return_id=pr.id
        WHERE pr.supplier_id=? GROUP BY pr.id ORDER BY pr.id DESC LIMIT 100`, [supplierId]),
      supplierOpenInvoices(db, supplierId),
      supplierStatement(db, supplierId),
      db.all(`SELECT grl.variant_id,mi.name AS product_name,v.variant_name,v.sku,
        COUNT(*) AS receipt_count,SUM(grl.stock_quantity) AS received_quantity,
        MAX(grn.posted_at) AS last_purchase_at
        FROM goods_receipt_lines grl JOIN goods_receipts grn ON grn.id=grl.goods_receipt_id AND grn.status='POSTED'
        JOIN menu_item_variants v ON v.id=grl.variant_id JOIN menu_items mi ON mi.id=v.menu_item_id
        WHERE grn.supplier_id=? GROUP BY grl.variant_id,mi.name,v.variant_name,v.sku
        ORDER BY last_purchase_at DESC LIMIT 100`, [supplierId]),
    ]);
    const pricing = await db.all(`SELECT grl.variant_id,grl.unit_cost,grl.stock_quantity,grn.posted_at,grn.grn_number,grn.id AS receipt_id
      FROM goods_receipt_lines grl JOIN goods_receipts grn ON grn.id=grl.goods_receipt_id
      WHERE grn.supplier_id=? AND grn.status='POSTED' ORDER BY grn.id DESC,grl.id DESC LIMIT 400`, [supplierId]);
    const prices = new Map();
    for (const row of pricing) {
      const key = Number(row.variant_id);
      if (!prices.has(key)) prices.set(key, []);
      if (prices.get(key).length < 5) prices.get(key).push(row);
    }
    const account = await db.get(`SELECT id FROM accounts WHERE code='2010'`);
    const balance = account ? await db.get(`SELECT COALESCE(SUM(credit-debit),0) AS outstanding FROM journal_lines WHERE account_id=? AND supplier_id=?`, [account.id, supplierId]) : null;
    return NextResponse.json({ supplier, summary: {
      outstanding: Number(balance?.outstanding || 0), open_orders: orders.filter((row) => ['APPROVED','PARTIALLY_RECEIVED','PENDING_APPROVAL'].includes(row.status)).length,
      last_receipt: receipts.find((row) => row.status === 'POSTED')?.posted_at || null,
      open_invoices: invoices.length,
    }, orders, receipts, returns, invoices, statement,
      products: products.map((row) => ({ ...row, recent_prices: prices.get(Number(row.variant_id)) || [] })),
      limitation: 'Retail receipts have no due-date field; overdue amounts cannot be calculated.' });
  } catch (error) { return handleRouteError(error, 'Could not load retail supplier.'); }
}
