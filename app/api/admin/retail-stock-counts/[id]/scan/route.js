import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { recordCountScan } from '@/lib/retail-stock-counts.js';

export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.count.perform' });
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const data = await request.json();
    const db = Database.getInstance();
    const line = await recordCountScan(db, id, {
      variantId: data.variant_id, batchId: data.batch_id || null, delta: data.delta ?? 1, countedBy: auth.user.id,
    });
    return NextResponse.json({ line });
  } catch (error) {
    return handleRouteError(error, 'Failed to record scan');
  }
}
