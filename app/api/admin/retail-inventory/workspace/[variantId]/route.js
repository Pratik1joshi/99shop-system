import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { ensureRetailPurchasingSchema } from '@/lib/retail-purchasing.js';
import { ensureRetailSerialsSchema } from '@/lib/retail-serials.js';
import { ensureRetailStockCountsSchema } from '@/lib/retail-stock-counts.js';
import { ensureRetailTransfersSchema } from '@/lib/retail-transfers.js';

export async function GET(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view' });
    if (auth.error) return auth.error;
    const costAuth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view_cost' });
    const showCost = !costAuth.error;
    const { variantId: rawId } = await context.params;
    const variantId = Number(rawId);
    const locationId = Number(new URL(request.url).searchParams.get('location_id'));
    if (!Number.isInteger(variantId) || !Number.isInteger(locationId) || variantId <= 0 || locationId <= 0) return NextResponse.json({ error: 'Choose a SKU and location.' }, { status: 400 });
    const db = Database.getInstance();
    await ensureRetailPurchasingSchema(db);
    await ensureRetailSerialsSchema(db);
    await ensureRetailStockCountsSchema(db);
    await ensureRetailTransfersSchema(db);
    const identity = await db.get(`SELECT v.id AS variant_id,p.id AS product_id,p.name AS product_name,v.variant_name,v.sku,v.tracking_mode,
      v.reorder_point,v.reorder_quantity,l.id AS location_id,l.name AS location_name,l.code AS location_code,
      (SELECT COALESCE(SUM(b.quantity_on_hand),0) FROM inventory_balances b WHERE b.variant_id=v.id AND b.location_id=l.id) AS on_hand
      ${showCost ? ',ic.average_cost AS current_cost' : ''}
      FROM menu_item_variants v JOIN menu_items p ON p.id=v.menu_item_id
      JOIN inventory_locations l ON l.id=? ${showCost ? 'LEFT JOIN inventory_costs ic ON ic.variant_id=v.id' : ''}
      WHERE v.id=?`, [locationId, variantId]);
    if (!identity) return NextResponse.json({ error: 'Stock identity not found.' }, { status: 404 });
    const movements = await db.all(`SELECT m.id,m.created_at,m.movement_type,m.quantity,m.balance_after,m.reference_type,m.reference_id,m.reason,
      m.batch_id,b.batch_number,u.full_name AS actor${showCost ? ',m.unit_cost,m.total_cost' : ''}
      FROM inventory_movements m LEFT JOIN inventory_batches b ON b.id=m.batch_id LEFT JOIN users u ON u.id=m.created_by
      WHERE m.variant_id=? AND m.location_id=? ORDER BY m.id DESC LIMIT 30`, [variantId, locationId]);
    const batches = identity.tracking_mode === 'batch' ? await db.all(`SELECT b.id,b.batch_number,b.expiry_date,b.received_at,b.status,s.name AS supplier_name,
      bal.quantity_on_hand${showCost ? ',b.unit_cost' : ''}
      FROM inventory_balances bal JOIN inventory_batches b ON b.id=bal.batch_id LEFT JOIN suppliers s ON s.id=b.supplier_id
      WHERE bal.variant_id=? AND bal.location_id=? AND bal.quantity_on_hand>0 ORDER BY b.expiry_date,b.id LIMIT 100`, [variantId, locationId]) : [];
    const serials = identity.tracking_mode === 'serial' ? await db.all(`SELECT id,serial_number,status,received_at,sold_at,warranty_end_date
      FROM inventory_serials WHERE variant_id=? AND location_id=? ORDER BY id DESC LIMIT 50`, [variantId, locationId]) : [];
    const purchaseOrders = await db.all(`SELECT po.id,po.po_number,po.status,po.expected_date,s.name AS supplier_name,
      pol.ordered_quantity,pol.quantity_received FROM purchase_order_lines pol
      JOIN purchase_orders po ON po.id=pol.purchase_order_id LEFT JOIN suppliers s ON s.id=po.supplier_id
      WHERE pol.variant_id=? AND po.location_id=? AND po.status IN ('APPROVED','PARTIALLY_RECEIVED')
      AND pol.ordered_quantity>pol.quantity_received ORDER BY po.id DESC LIMIT 20`, [variantId, locationId]);
    const counts = await db.all(`SELECT c.id,c.count_number,c.status,c.started_at,c.posted_at,cl.physical_quantity,
      cl.variance${showCost ? ',cl.value_variance' : ''} FROM retail_stock_count_lines cl
      JOIN retail_stock_counts c ON c.id=cl.retail_stock_count_id
      WHERE cl.variant_id=? AND c.location_id=? ORDER BY c.id DESC LIMIT 15`, [variantId, locationId]);
    const transfers = await db.all(`SELECT t.id,t.transfer_number,t.status,t.requested_at,t.dispatched_at,t.received_at,
      sl.name AS source_name,dl.name AS destination_name,tl.requested_quantity,tl.received_quantity
      FROM retail_transfer_lines tl JOIN retail_transfers t ON t.id=tl.retail_transfer_id
      LEFT JOIN inventory_locations sl ON sl.id=t.source_location_id LEFT JOIN inventory_locations dl ON dl.id=t.destination_location_id
      WHERE tl.variant_id=? AND (t.source_location_id=? OR t.destination_location_id=?) ORDER BY t.id DESC LIMIT 15`, [variantId, locationId, locationId]);
    return NextResponse.json({ identity, movements, batches, serials, purchase_orders: purchaseOrders, counts, transfers });
  } catch (error) { return handleRouteError(error, 'Could not load stock detail.'); }
}
