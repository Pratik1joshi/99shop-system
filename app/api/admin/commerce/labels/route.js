import { ensureRetailCommerceSchema } from '@/lib/retail-commerce-schema.js';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth,handleRouteError } from '@/lib/api-guard.js';
import { resolveRetailPrices } from '@/lib/retail-pricing.js';
import { internalCatalogBarcode } from '@/lib/retail-merchandising.js';
import { lockCatalogWrite } from '@/lib/retail-catalog-lock.js';
export async function GET(request){try{
  const auth=await requireAuth(request,{roles:['admin','cashier'],permission:'menu.view'});if(auth.error)return auth.error;await ensureRetailCommerceSchema(Database.getInstance());
  const ids=[...new Set((new URL(request.url).searchParams.get('ids')||'').split(',').filter(Boolean).map(Number))];
  if(!ids.length||ids.length>200||ids.some(id=>!Number.isSafeInteger(id)||id<=0))return NextResponse.json({error:'Choose between 1 and 200 SKUs'},{status:400});
  const db=Database.getInstance(),rows=await db.all(`SELECT v.id,v.sku,v.variant_name,v.mrp,p.name,COALESCE(NULLIF(v.barcode,''),(SELECT b.barcode FROM product_barcodes b WHERE b.variant_id=v.id ORDER BY b.is_primary DESC,b.id LIMIT 1),CASE WHEN (SELECT COUNT(*) FROM menu_item_variants sv WHERE sv.menu_item_id=p.id)=1 THEN NULLIF(p.barcode,'') END) AS barcode FROM menu_item_variants v JOIN menu_items p ON p.id=v.menu_item_id WHERE v.id IN (${ids.map(()=>'?').join(',')})`,ids);
  const prices=new Map((await resolveRetailPrices(db,ids.map(id=>({variant_id:id,quantity:1})))).map(row=>[row.variant_id,row.unit_price]));
  return NextResponse.json({rows:rows.map(row=>({...row,price:prices.get(Number(row.id))}))});
}catch(error){return handleRouteError(error,'Could not load barcode labels');}}

/** Gives each listed SKU without any barcode the shop's own number code so it can be printed. */
export async function POST(request){try{
  const auth=await requireAuth(request,{roles:['admin','cashier'],permission:'menu.manage'});if(auth.error)return auth.error;const db=Database.getInstance();await ensureRetailCommerceSchema(db);
  const input=await request.json();const ids=[...new Set((input.ids||[]).map(Number))];
  if(input.action!=='assign_missing'||!ids.length||ids.length>200||ids.some(id=>!Number.isSafeInteger(id)||id<=0))return NextResponse.json({error:'Choose between 1 and 200 SKUs'},{status:400});
  const assigned=await db.transaction(async tx=>{
    await lockCatalogWrite(tx);
    const rows=await tx.all(`SELECT v.id,v.menu_item_id,(SELECT COUNT(*) FROM menu_item_variants sv WHERE sv.menu_item_id=v.menu_item_id) AS siblings,p.barcode AS product_barcode FROM menu_item_variants v JOIN menu_items p ON p.id=v.menu_item_id
      WHERE v.id IN (${ids.map(()=>'?').join(',')}) AND COALESCE(v.barcode,'')='' AND NOT EXISTS(SELECT 1 FROM product_barcodes b WHERE b.variant_id=v.id)`,ids);
    let count=0;
    for(const row of rows){
      // A single-SKU product that already has a product barcode keeps it; otherwise mint one.
      const code=Number(row.siblings)===1&&String(row.product_barcode||'').trim()?row.product_barcode:internalCatalogBarcode();
      await tx.run('UPDATE menu_item_variants SET barcode=? WHERE id=?',[code,row.id]);
      if(Number(row.siblings)===1)await tx.run("UPDATE menu_items SET barcode=? WHERE id=? AND COALESCE(barcode,'')=''",[code,row.menu_item_id]);
      count++;
    }
    return count;
  });
  return NextResponse.json({assigned});
}catch(error){return handleRouteError(error,'Could not create barcodes');}}
