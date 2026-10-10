import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import {
  recordDamage, recordExpiry, recordTester, recordSample, recordInternalUse, recordShrinkage,
  recordManualAdjustment, moveToQuarantine, releaseFromQuarantine, listAdjustments,
} from '@/lib/retail-inventory-adjustments.js';
import { redactRetailCost } from '@/lib/retail-cost-visibility.js';

const PERMISSION_BY_TYPE = {
  DAMAGE: 'retail_inventory.damage',
  EXPIRY: 'retail_inventory.expiry',
  TESTER: 'retail_inventory.tester',
  SAMPLE: 'retail_inventory.sample',
  INTERNAL_USE: 'retail_inventory.internal_use',
  SHRINKAGE: 'retail_inventory.adjust',
  MANUAL: 'retail_inventory.adjust',
  QUARANTINE_MOVE: 'retail_inventory.quarantine_release',
  QUARANTINE_RELEASE: 'retail_inventory.quarantine_release',
};

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view' });
    if (auth.error) return auth.error;
    const { searchParams } = new URL(request.url);
    const db = Database.getInstance();
    const rows = await listAdjustments(db, { type: searchParams.get('type') || null });
    return NextResponse.json({ retail_inventory_adjustments: redactRetailCost(rows, auth.user.role) });
  } catch (error) {
    return handleRouteError(error, 'Could not load adjustments.');
  }
}

export async function POST(request) {
  try {
    const data = await request.json();
    const type = String(data.type || '').toUpperCase();
    const permission = PERMISSION_BY_TYPE[type];
    if (!permission) return NextResponse.json({ error: `Unknown adjustment type "${type}".` }, { status: 400 });

    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission });
    if (auth.error) return auth.error;
    const costAuth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view_cost' });
    if (costAuth.error) delete data.unit_cost;

    const idempotencyKey = String(data.idempotency_key || '').trim().slice(0, 100);
    if (!idempotencyKey) return NextResponse.json({ error: 'Missing idempotency key. Please retry.' }, { status: 400 });

    const db = Database.getInstance();
    const common = {
      variantId: data.variant_id, locationId: data.location_id || null, batchId: data.batch_id || null,
      quantity: data.quantity, serialNumbers: data.serial_numbers || null,
      notes: data.notes || null, createdBy: auth.user.id, idempotencyKey,
    };

    let result;
    switch (type) {
      case 'DAMAGE': result = await recordDamage(db, { ...common, reason: data.reason }); break;
      case 'EXPIRY': result = await recordExpiry(db, { ...common, reason: data.reason }); break;
      case 'TESTER': result = await recordTester(db, { ...common, reason: data.reason }); break;
      case 'SAMPLE': result = await recordSample(db, { ...common, reason: data.reason }); break;
      case 'INTERNAL_USE': result = await recordInternalUse(db, { ...common, reason: data.reason }); break;
      case 'SHRINKAGE': result = await recordShrinkage(db, { ...common, reason: data.reason || 'THEFT' }); break;
      case 'MANUAL':
        result = await recordManualAdjustment(db, { ...common, reason: data.reason, unitCost: data.unit_cost ?? null });
        break;
      case 'QUARANTINE_MOVE':
        result = await moveToQuarantine(db, { ...common, fromLocationId: data.location_id || null });
        break;
      case 'QUARANTINE_RELEASE':
        result = await releaseFromQuarantine(db, { ...common, toLocationId: data.destination_location_id || null });
        break;
      default:
        return NextResponse.json({ error: `Unknown adjustment type "${type}".` }, { status: 400 });
    }
    return NextResponse.json({ message: 'Adjustment posted', retail_inventory_adjustment: redactRetailCost(result, auth.user.role) });
  } catch (error) {
    return handleRouteError(error, 'Failed to post adjustment');
  }
}
