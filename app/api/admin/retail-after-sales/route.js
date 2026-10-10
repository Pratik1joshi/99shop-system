import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { isPermissionAllowedSync } from '@/lib/permissions.js';
import {afterSalesSummary} from '@/lib/retail-after-sales-summary.js';
import {ensureAfterSalesSchema} from '@/lib/retail-after-sales-schema.js';
import { createWarrantyClaim, getWarrantyClaim, listWarrantyClaims, searchWarrantyPurchases, warrantyEligibility, saveWarrantyPolicy, warrantyAction } from '@/lib/retail-warranty.js';
const permissions={claim:'warranty.create',policy:'warranty.configure',inspect:'warranty.inspect',approve:'warranty.approve',reject:'warranty.approve',repair:'warranty.repair',repair_update:'warranty.repair',part:'warranty.parts',replace:'warranty.replace',refund:'warranty.refund',rma:'warranty.rma',rma_receive:'warranty.rma',transition:'warranty.close',note:'warranty.create'};
export async function GET(request){try{
  const auth=await requireAuth(request,{permission:'warranty.view'});if(auth.error)return auth.error;
  const db=Database.getInstance(),p=new URL(request.url).searchParams;
  await ensureAfterSalesSchema(db);
  if(p.get('view')==='summary')return NextResponse.json({data:await afterSalesSummary(db,{viewCost:isPermissionAllowedSync(auth.user.role,'warranty.cost')})},{headers:{'Cache-Control':'no-store'}});
  let data;
  if(p.get('view')==='skus'||p.get('view')==='suppliers'){
    const q='%'+String(p.get('q')||'').trim().slice(0,100).toLowerCase()+'%';
    data=p.get('view')==='suppliers'?await db.all('SELECT id,name FROM suppliers WHERE LOWER(name) LIKE ? ORDER BY name LIMIT 20',[q]):await db.all(`SELECT v.id,v.sku,p.name||' / '||v.variant_name AS name FROM menu_item_variants v JOIN menu_items p ON p.id=v.menu_item_id WHERE LOWER(p.name) LIKE ? OR LOWER(v.sku) LIKE ? OR v.barcode LIKE ? OR EXISTS(SELECT 1 FROM product_barcodes b WHERE b.variant_id=v.id AND b.barcode LIKE ?) ORDER BY v.id LIMIT 20`,[q,q,q,q]);
    return NextResponse.json({data},{headers:{'Cache-Control':'no-store'}});
  }
  if(p.get('view')==='policies'){const check=await requireAuth(request,{permission:'warranty.configure'});if(check.error)return check.error;data=await db.all('SELECT * FROM warranty_policies ORDER BY id DESC LIMIT 100');}
  else if(p.get('view')==='purchases')data=await searchWarrantyPurchases(db,{query:p.get('q'),customerId:p.get('customer_id'),saleId:p.get('sale_id'),page:p.get('page')});
  else if(p.get('view')==='eligibility'){const result=await warrantyEligibility(db,{saleLineId:p.get('sale_line_id'),serialNumber:p.get('serial_number')||'',customerId:p.get('customer_id'),proof:p.get('proof')==='1'});data={status:result.status,snapshot:result.snapshot,returned_quantity:result.returned_quantity};}
  else if(p.get('id'))data=await getWarrantyClaim(db,p.get('id'),{viewCost:isPermissionAllowedSync(auth.user.role,'warranty.cost')});
  else data=await listWarrantyClaims(db,{query:p.get('q'),status:p.get('status'),customerId:p.get('customer_id'),page:p.get('page'),filters:Object.fromEntries(p)});
  return NextResponse.json({data},{headers:{'Cache-Control':'no-store'}});
}catch(e){return handleRouteError(e,'Could not load after-sales.');}}
export async function POST(request){try{
  const base=await requireAuth(request,{permission:'warranty.view'});if(base.error)return base.error;
  if(Number(request.headers.get('content-length')||0)>32768)return NextResponse.json({error:'Request too large'},{status:413});
  const input=await request.json(),permission=Object.hasOwn(permissions,input.action)?permissions[input.action]:null;if(!permission)return NextResponse.json({error:'Unknown action'},{status:400});
  const auth=await requireAuth(request,{permission});if(auth.error)return auth.error;
  const db=Database.getInstance(),data=input.action==='claim'?await createWarrantyClaim(db,input,{actorId:auth.user.id}):input.action==='policy'?await saveWarrantyPolicy(db,input,auth.user.id):await warrantyAction(db,Number(input.id),input,auth.user.id);
  return NextResponse.json({data},{headers:{'Cache-Control':'no-store'}});
}catch(e){return handleRouteError(e,'Could not save after-sales action.');}}
