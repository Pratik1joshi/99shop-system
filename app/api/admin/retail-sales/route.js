import { commerceSaleVisibility, assertHeldOwner } from '@/lib/commerce-visibility.js';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { holdSale, listHeldSales, listRetailSales } from '@/lib/retail-sales.js';
import { readListParams } from '@/lib/paginate.js';

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager', 'accountant'], permission: 'retail_sale.view' });
    if (auth.error) return auth.error;

    const params = new URL(request.url).searchParams;
    const status = params.get('status');
    const db = Database.getInstance();
    if (status === 'HELD') {
      const held = await listHeldSales(db, { cashierId: auth.user.role === "admin" ? null : auth.user.id, page: params.get("page"), pageSize: 40 });
      return NextResponse.json({ retail_sales: held.map((sale) => commerceSaleVisibility(sale, auth.user.role)) });
    }

    const listParams = readListParams(params);
    const result = await listRetailSales(db, {
      ...listParams, exportAll: false,
      status: status || null,
      cashierId: params.get('cashierId') ? Number(params.get('cashierId')) : null,
      customerId: params.get('customerId') ? Number(params.get('customerId')) : null,
      businessDayId: params.get('businessDayId') ? Number(params.get('businessDayId')) : null,
      paymentMethod: params.get('paymentMethod') || null,
      from: params.get('from') || null,
      to: params.get('to') || null,
      minAmount: params.get('minAmount'),
      maxAmount: params.get('maxAmount'),
    });
    return NextResponse.json({ retail_sales: result.rows.map((sale) => commerceSaleVisibility(sale, auth.user.role)), pagination: result.pagination });
  } catch (error) {
    return handleRouteError(error, 'Could not load retail sales.');
  }
}

export async function POST(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier', 'manager'], permission: 'retail_pos.use' });
    if (auth.error) return auth.error;

    const data = await request.json();
    const db = Database.getInstance();
    const sale = await holdSale(db, { ...data, cashier_id: auth.user.id, cashierId: auth.user.id, allowPriceOverride: false });
    return NextResponse.json({ message: 'Sale held', retail_sale: commerceSaleVisibility(sale, auth.user.role) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, 'Failed to hold sale');
  }
}
