import { ensureRetailCommerceSchema } from '@/lib/retail-commerce-schema.js';
import { publicProduct } from '@/lib/retail-storefront.js';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth,handleRouteError } from '@/lib/api-guard.js';
import { isPermissionAllowedSync } from '@/lib/permissions.js';
import { getProductMerchandising,saveProductMerchandising } from '@/lib/retail-product-merchandising.js';
export async function GET(request){try{const auth=await requireAuth(request,{roles:['admin','cashier'],permission:'menu.manage'});if(auth.error)return auth.error;await ensureRetailCommerceSchema(Database.getInstance());if(new URL(request.url).searchParams.get('preview')==='1')return NextResponse.json(await publicProduct(Database.getInstance(),new URL(request.url).searchParams.get('id'),{preview:true}),{headers:{'Cache-Control':'private, no-store'}});return NextResponse.json(await getProductMerchandising(Database.getInstance(),Number(new URL(request.url).searchParams.get('id')),{costAccess:isPermissionAllowedSync(auth.user.role,'retail_inventory.view_cost')}));}catch(error){return handleRouteError(error,'Could not load product merchandising');}}
export async function POST(request){try{const auth=await requireAuth(request,{roles:['admin','cashier'],permission:'menu.manage'});if(auth.error)return auth.error;await ensureRetailCommerceSchema(Database.getInstance());return NextResponse.json(await saveProductMerchandising(Database.getInstance(),await request.json(),auth.user.id));}catch(error){return handleRouteError(error,'Could not save product merchandising');}}
