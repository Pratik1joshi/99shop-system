import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { listLocations, createLocation } from '@/lib/retail-inventory.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'retail_inventory.view' });
    if (auth.error) return auth.error;
    const { searchParams } = new URL(request.url);
    const db = Database.getInstance();
    const locations = await listLocations(db, { activeOnly: searchParams.get('all') !== '1' });
    // IN_TRANSIT is a system holding location — never a valid pick for a UI dropdown.
    return NextResponse.json({ locations: locations.filter((l) => l.code !== 'IN_TRANSIT') });
  } catch (error) {
    return handleRouteError(error, 'Could not load locations.');
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin'], permission: 'retail_inventory.adjust' });
    if (auth.error) return auth.error;
    const data = await request.json();
    const db = Database.getInstance();
    const location = await createLocation(db, { name: data.name, code: data.code, locationType: data.location_type || 'shop' });
    return NextResponse.json({ message: 'Location created', location });
  } catch (error) {
    return handleRouteError(error, 'Failed to create location');
  }
}
