import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { getSerial } from '@/lib/retail-serials.js';
import { redactRetailCost } from '@/lib/retail-cost-visibility.js';
import { ensureAfterSalesSchema } from '@/lib/retail-after-sales-schema.js';

export async function GET(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view' });
    if (auth.error) return auth.error;
    const { serialNumber } = await context.params;
    const db = Database.getInstance();
    const row = await getSerial(db, decodeURIComponent(serialNumber));
    if (!row) return NextResponse.json({ error: 'Serial not found.' }, { status: 404 });
    const customerAuth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'customers.access' });
    const safe = { ...row };
    const warrantyAuth = await requireAuth(request, { permission: 'warranty.view' });
    if (!warrantyAuth.error) {
      await ensureAfterSalesSchema(db);
      safe.coverage = await db.get('SELECT starts_at,expires_at,terms FROM warranty_snapshots WHERE serial_number=? ORDER BY id DESC LIMIT 1',[row.serial_number]);
      if(safe.coverage) safe.warranty_end_date=safe.coverage.expires_at;
      safe.after_sales = await db.all(`SELECT c.id,c.claim_number,c.status,c.resolution,c.created_at,c.replacement_serial,r.rma_number,r.status AS supplier_status,r.replacement_serial AS supplier_replacement_serial FROM warranty_claims c LEFT JOIN warranty_rmas r ON r.claim_id=c.id WHERE c.serial_number=? OR c.replacement_serial=? OR r.replacement_serial=? ORDER BY c.id`,[row.serial_number,row.serial_number,row.serial_number]);
    }
    if (customerAuth.error) { delete safe.customer_id; delete safe.customer_name; }
    return NextResponse.json({ serial: redactRetailCost(safe, auth.user.role) });
  } catch (error) {
    return handleRouteError(error, 'Could not load serial.');
  }
}
