import { ensureRetailCommerceSchema } from '@/lib/retail-commerce-schema.js';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth,handleRouteError } from '@/lib/api-guard.js';
import { savePriceList,saveCustomerGroup,assignCustomerGroup } from '@/lib/retail-price-management.js';
import { saveMarginPolicy } from '@/lib/retail-margin-policy.js';
import { isPermissionAllowedSync } from '@/lib/permissions.js';
import { previewMassPrices,applyMassPrices } from '@/lib/retail-mass-pricing.js';
export async function GET(request) {
  try {
    const auth=await requireAuth(request,{roles:['admin','cashier'],permission:'menu.manage'});
    if(auth.error)return auth.error;await ensureRetailCommerceSchema(Database.getInstance());
    const db=Database.getInstance(),url=new URL(request.url),id=Number(url.searchParams.get('id'));
    const productId=Number(url.searchParams.get('product_id'));
    if(productId)return NextResponse.json({rules:await db.all(`SELECT i.id,i.variant_id,i.product_id,i.min_quantity,i.fixed_price,i.adjustment_percent,l.id AS list_id,l.name AS list_name,l.code,l.active,l.channel,l.priority,l.customer_group_id,l.starts_at,l.ends_at,g.name AS group_name,v.variant_name
      FROM retail_price_list_items i JOIN retail_price_lists l ON l.id=i.price_list_id LEFT JOIN retail_customer_groups g ON g.id=l.customer_group_id LEFT JOIN menu_item_variants v ON v.id=i.variant_id
      WHERE i.product_id=? OR i.variant_id IN (SELECT id FROM menu_item_variants WHERE menu_item_id=?) ORDER BY l.id DESC,i.min_quantity LIMIT 100`,[productId,productId])});
    if(id)return NextResponse.json({list:await db.get('SELECT * FROM retail_price_lists WHERE id=?',[id]),items:await db.all('SELECT i.*,v.sku,p.name AS product_name FROM retail_price_list_items i LEFT JOIN menu_item_variants v ON v.id=i.variant_id LEFT JOIN menu_items p ON p.id=COALESCE(i.product_id,v.menu_item_id) WHERE i.price_list_id=? ORDER BY i.id LIMIT 1000',[id])});
    const page=Math.max(1,Number(url.searchParams.get('page'))||1);
    return NextResponse.json({lists:await db.all('SELECT * FROM retail_price_lists ORDER BY id DESC LIMIT 100 OFFSET ?',[(page-1)*100]),groups:await db.all('SELECT * FROM retail_customer_groups ORDER BY name LIMIT 500'),audit:await db.all('SELECT a.id,a.action,a.source_id,a.reason,a.created_at,u.full_name AS actor_name FROM retail_price_audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 50'),policy:await db.get('SELECT mode,minimum_percent FROM retail_margin_policy WHERE id=1')});
  }catch(error){return handleRouteError(error,'Could not load pricing');}
}
export async function POST(request) {
  try {
    const auth=await requireAuth(request,{roles:['admin','cashier'],permission:'menu.manage'});
    if(auth.error)return auth.error;await ensureRetailCommerceSchema(Database.getInstance());
    const input=await request.json(),db=Database.getInstance();
    if(input.action==='preview_mass')return NextResponse.json(await previewMassPrices(db,input,auth.user.id,{costAccess:isPermissionAllowedSync(auth.user.role,'retail_inventory.view_cost')}));
    if(input.action==='apply_mass')return NextResponse.json(await applyMassPrices(db,input,auth.user.id));
    if(input.action==='margin_policy'&&!isPermissionAllowedSync(auth.user.role,'retail_sale.price_override'))return NextResponse.json({error:'Price-override permission is required to change margin protection'},{status:403});
    const actions={price_list:savePriceList,customer_group:saveCustomerGroup,assign_group:assignCustomerGroup,margin_policy:saveMarginPolicy};
    if(!actions[input.action])return NextResponse.json({error:'Unsupported pricing action'},{status:400});
    return NextResponse.json(await actions[input.action](db,input,auth.user.id));
  }catch(error){return handleRouteError(error,'Could not save pricing');}
}
