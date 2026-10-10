import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { queryRetailTracking } from '@/lib/retail-tracking-query.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view' });
    if (auth.error) return auth.error;
    const costAuth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view_cost' });
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await queryRetailTracking(Database.getInstance(), {
      mode: params.get('mode'), query: params.get('q'), state: params.get('state'), locationId: params.get('location_id'),
      page: params.get('page'), pageSize: params.get('page_size'), showCost: !costAuth.error,
    }));
  } catch (error) { return handleRouteError(error, 'Could not load tracked stock.'); }
}
