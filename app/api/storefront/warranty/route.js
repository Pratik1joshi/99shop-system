import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { storeIdentity,publicBody,rateLimitStore } from '@/lib/retail-public-security.js';
import { createWarrantyClaim,getWarrantyClaim,searchWarrantyPurchases } from '@/lib/retail-warranty.js';
const reply=(data,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request){try{
  const db=Database.getInstance(),identity=await storeIdentity(db,request);if(!identity.customerId)return reply({error:'Please sign in.'},401);
  const p=new URL(request.url).searchParams;let data;
  if(p.get('id'))data=await getWarrantyClaim(db,p.get('id'),{customerId:identity.customerId});
  else if(p.get('view')==='purchases')data=(await searchWarrantyPurchases(db,{customerId:identity.customerId,page:p.get('page')})).map(r=>({sale_line_id:r.sale_line_id,snapshot_id:r.snapshot_id,product_name:r.product_name,sale_number:r.sale_number,serial_number:r.serial_number,expires_at:r.expires_at,quantity:r.quantity,batches:r.batches}));
  else {const rows=await db.all('SELECT id FROM warranty_claims WHERE customer_id=? ORDER BY id DESC LIMIT 40',[identity.customerId]);data=await Promise.all(rows.map(r=>getWarrantyClaim(db,r.id,{customerId:identity.customerId})));}
  return reply({data});
}catch(e){return reply({error:e.status&&e.status<500?e.message:'Could not load service requests.'},e.status||500);}}
export async function POST(request){try{
  const db=Database.getInstance(),identity=await storeIdentity(db,request);if(!identity.customerId)return reply({error:'Please sign in.'},401);
  const input=await publicBody(request);await rateLimitStore(db,'warranty:'+identity.customerId,20,3600);
  const data=await createWarrantyClaim(db,input,{customerId:identity.customerId,selfService:true});return reply({data});
}catch(e){return reply({error:e.status&&e.status<500?e.message:'Could not submit service request.'},e.status||500);}}
