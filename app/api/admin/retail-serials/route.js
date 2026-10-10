import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getDefaultLocation } from '@/lib/retail-inventory.js';

/** Checkout-safe lookup: exposes only saleable identity fields, never costs. */
export async function GET(request) {
  try {
    const posAuth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_pos.use' });
    const inventoryAuth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view' });
    if (posAuth.error && inventoryAuth.error) return posAuth.error;
    const params = new URL(request.url).searchParams;
    const variantId = Number(params.get('variantId'));
    if (!variantId) return NextResponse.json({ error: 'Choose a variant.' }, { status: 400 });
    const db = Database.getInstance();
    const location = await getDefaultLocation(db);
    const locationId = !inventoryAuth.error && Number(params.get('location_id')) > 0 ? Number(params.get('location_id')) : location?.id;
    const query = String(params.get('q') || '').trim().slice(0, 120);
    const page = Math.max(1, Math.min(10000, Number(params.get('page')) || 1));
    const rows = await db.all(`SELECT id,serial_number,received_at FROM inventory_serials WHERE variant_id=? AND location_id=? AND status='IN_STOCK'
      AND serial_number LIKE ? ORDER BY CASE WHEN serial_number=? THEN 0 ELSE 1 END,serial_number,id LIMIT 41 OFFSET ?`, [variantId, locationId, `%${query.replace(/[%_]/g,'')}%`, query, (page - 1) * 40]);
    return NextResponse.json({
      serials: rows.slice(0, 40).map((row) => ({ id: row.id, serial_number: row.serial_number, received_at: row.received_at })),
      has_more: rows.length > 40, page,
    });
  } catch (error) {
    return handleRouteError(error, 'Could not load available serial numbers.');
  }
}
