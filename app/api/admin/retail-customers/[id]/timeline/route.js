import { NextResponse } from 'next/server';
import Database from '@/lib/db/index.js';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { isPermissionAllowedSync } from '@/lib/permissions.js';
import { getCustomerTimeline } from '@/lib/retail-customer-timeline.js';

export async function GET(request, { params }) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager', 'accountant'], permission: 'customers.access' });
    if (auth.error) return auth.error;
    const id = Number((await params).id);
    if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Invalid customer.' }, { status: 400 });
    const db = Database.getInstance();
    if (!await db.get('SELECT id FROM customers WHERE id=?', [id])) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
    const query = new URL(request.url).searchParams;
    return NextResponse.json(await getCustomerTimeline(db, id, { includeWarranty:isPermissionAllowedSync(auth.user.role,'warranty.view'),includeMaster: auth.user.role === 'admin', page: query.get('page'), pageSize: query.get('page_size'), sourceType: query.get('source_type'), sourceId: query.get('source_id'), channel:query.get('channel'), includeApprovals: ['admin', 'manager'].includes(auth.user.role) }), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return handleRouteError(error, 'Could not load customer timeline.'); }
}
