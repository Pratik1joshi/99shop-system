import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { setCountQuantity, setCountSerials } from '@/lib/retail-stock-counts.js';

export async function PUT(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.count.perform' });
    if (auth.error) return auth.error;
    const { id, lineId } = await context.params;
    const data = await request.json();
    const db = Database.getInstance();
    const line = Array.isArray(data.serial_numbers)
      ? await setCountSerials(db, id, lineId, { serialNumbers: data.serial_numbers, countedBy: auth.user.id })
      : await setCountQuantity(db, id, lineId, { physicalQuantity: data.physical_quantity, countedBy: auth.user.id });
    return NextResponse.json({ line });
  } catch (error) {
    return handleRouteError(error, 'Failed to record count');
  }
}
