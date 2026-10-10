import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { ensureSupplierSchema, listSuppliers, resolveSupplier } from '@/lib/suppliers.js';
import { readListParams } from '@/lib/paginate.js';
import { redactRetailCost } from '@/lib/retail-cost-visibility.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'suppliers.view' });
    if (auth.error) return auth.error;

    const db = Database.getInstance();
    await ensureSupplierSchema(db);

    const q = new URL(request.url).searchParams;
    const { rows, pagination } = await listSuppliers(db, {
      ...readListParams(q, { defaultDir: 'asc' }),
      includeArchived: q.get('include_archived') === '1',
    });
    return NextResponse.json({ suppliers: redactRetailCost(rows, auth.user.role, 'retail_purchasing.view_cost'), pagination });
  } catch (error) {
    return handleRouteError(error, 'Failed to load suppliers');
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'suppliers.manage' });
    if (auth.error) return auth.error;

    const data = await request.json();
    if (!String(data.name || '').trim()) {
      return NextResponse.json({ error: 'Supplier name is required.' }, { status: 400 });
    }

    const db = Database.getInstance();
    await ensureSupplierSchema(db);

    const supplier = await resolveSupplier(db, data.name, data);
    return NextResponse.json({ message: 'Supplier saved.', supplier }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, 'Failed to create supplier');
  }
}

/** PUT edits a supplier's details. */
export async function PUT(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'suppliers.manage' });
    if (auth.error) return auth.error;

    const data = await request.json();
    const db = Database.getInstance();
    await ensureSupplierSchema(db);

    if (!data.id) return NextResponse.json({ error: 'Which supplier should be updated?' }, { status: 400 });
    await db.run(
      `UPDATE suppliers SET name = ?, normalized_name = lower(trim(?)), phone = ?, email = ?,
              address = ?, notes = ?, is_archived = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        data.name,
        data.name,
        data.phone || null,
        data.email || null,
        data.address || null,
        data.notes || null,
        data.is_archived ? 1 : 0,
        data.id,
      ]
    );
    return NextResponse.json({
      message: 'Supplier updated.',
      supplier: await db.get('SELECT * FROM suppliers WHERE id = ?', [data.id]),
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to update supplier');
  }
}
