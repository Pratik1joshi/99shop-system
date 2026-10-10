import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { queryRetailMovements } from '@/lib/retail-movement-query.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view' });
    if (auth.error) return auth.error;
    const costAuth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view_cost' });
    const params = new URL(request.url).searchParams;
    return NextResponse.json(await queryRetailMovements(Database.getInstance(), {
      query: params.get('q'), type: params.get('type'), locationId: params.get('location_id'),
      page: params.get('page'), pageSize: params.get('page_size'), showCost: !costAuth.error,
    }));
  } catch (error) { return handleRouteError(error, 'Could not load movement history.'); }
}
