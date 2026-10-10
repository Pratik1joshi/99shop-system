import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { queryRetailStock } from '@/lib/retail-stock-query.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view' });
    if (auth.error) return auth.error;
    const costAuth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view_cost' });
    const params = new URL(request.url).searchParams;
    const result = await queryRetailStock(Database.getInstance(), {
      query: params.get('q'), state: params.get('state'), locationId: params.get('location_id'),
      page: params.get('page'), pageSize: params.get('page_size'), sort: params.get('sort'), showCost: !costAuth.error,
      productId: params.get('product_id'), groupByProduct: params.get('view') === 'products',
    });
    return NextResponse.json(result);
  } catch (error) { return handleRouteError(error, 'Could not load stock workspace.'); }
}
