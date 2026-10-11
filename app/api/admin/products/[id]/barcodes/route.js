import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { addBarcode, generateInternalBarcode, getBarcodesFor, removeBarcode,ensureProductCatalogSchema } from '@/lib/product-catalog.js';
import { lockCatalogWrite } from '@/lib/retail-catalog-lock.js';

async function ownedVariant(db, productId, variantId) {
  const variant = await db.get('SELECT id FROM product_variants WHERE id=? AND product_id=?', [variantId, productId]);
  if (!variant) throw Object.assign(new Error('SKU does not belong to this product.'), { status: 404 });
}

// Extra barcodes (manufacturer/supplier/alternate) beyond the one primary
// code products/product_variants already carry — see the schema migration.

export async function GET(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'catalog.view' });
    if (auth.error) return auth.error;

    const { id } = await context.params;
    const variantId = new URL(request.url).searchParams.get('variantId');
    const db = Database.getInstance();
    if (variantId) await ownedVariant(db, Number(id), Number(variantId));
    const barcodes = await getBarcodesFor(db, variantId ? { variantId: Number(variantId) } : { productId: Number(id) });
    return NextResponse.json({ barcodes });
  } catch (error) {
    return handleRouteError(error, 'Could not load barcodes.');
  }
}

export async function POST(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'catalog.manage' });
    if (auth.error) return auth.error;

    const { id } = await context.params;
    const data = await request.json();
    const db = Database.getInstance();
    await ensureProductCatalogSchema(db);
    return await db.transaction(async(db)=>{
    await lockCatalogWrite(db);
    if (data.variantId) await ownedVariant(db, Number(id), Number(data.variantId));
    const barcode = data.generate ? generateInternalBarcode() : String(data.barcode || '').trim();
    if (!barcode) throw Object.assign(new Error('Barcode required.'), { status: 400 });

    await addBarcode(db, {
      productId: data.variantId ? null : Number(id),
      variantId: data.variantId ? Number(data.variantId) : null,
      barcode,
      barcodeType: data.barcodeType || 'other',
    });

    return NextResponse.json({ message: 'Barcode added', barcode }, { status: 201 });
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to add barcode');
  }
}

export async function DELETE(request, context) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'catalog.manage' });
    if (auth.error) return auth.error;

    const barcodeId = new URL(request.url).searchParams.get('barcodeId');
    if (!barcodeId) throw Object.assign(new Error('barcodeId required.'), { status: 400 });

    const db = Database.getInstance();
    const { id } = await context.params;
    const owned = await db.get(`SELECT b.id FROM product_barcodes b
      LEFT JOIN product_variants v ON v.id=b.variant_id
      WHERE b.id=? AND COALESCE(v.product_id,b.product_id)=?`, [Number(barcodeId), Number(id)]);
    if (!owned) throw Object.assign(new Error('Barcode does not belong to this product.'), { status: 404 });
    await removeBarcode(db, Number(barcodeId));
    return NextResponse.json({ message: 'Barcode removed' });
  } catch (error) {
    return handleRouteError(error, 'Failed to remove barcode');
  }
}
