import { ensureRetailCommerceSchema } from '@/lib/retail-commerce-schema.js';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth,handleRouteError } from '@/lib/api-guard.js';
import { catalogRows,previewCatalogChange,applyCatalogChange,CATALOG_COLUMNS,internalCatalogBarcode } from '@/lib/retail-merchandising.js';
import { previewVariantMatrix,exportCatalogCsv,parseCatalogCsv } from '@/lib/retail-catalog-matrix.js';
import { isPermissionAllowedSync } from '@/lib/permissions.js';
import { redactRetailCost } from '@/lib/retail-cost-visibility.js';
export async function GET(request){
  try{
    const auth=await requireAuth(request,{roles:['admin','cashier'],permission:'menu.manage'});if(auth.error)return auth.error;await ensureRetailCommerceSchema(Database.getInstance());
    const db=Database.getInstance(),url=new URL(request.url),id=Number(url.searchParams.get('product_id'));
    const rows=redactRetailCost(await catalogRows(db,id),auth.user.role);
    if(url.searchParams.get('format')==='csv'){
      const columns=CATALOG_COLUMNS.filter(key=>key!=='purchase_cost'||isPermissionAllowedSync(auth.user.role,'retail_inventory.view_cost'));
      return new Response(exportCatalogCsv(rows.map(row=>({...row,barcodes:row.barcodes.join('|'),attributes:JSON.stringify(row.attributes)})),columns),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="catalog-${id}.csv"`,'Cache-Control':'no-store'}});
    }
    return NextResponse.json({rows});
  }catch(error){return handleRouteError(error,'Could not load merchandising');}
}
export async function POST(request){
  try{
    const auth=await requireAuth(request,{roles:['admin','cashier'],permission:'menu.manage'});if(auth.error)return auth.error;await ensureRetailCommerceSchema(Database.getInstance());
    const db=Database.getInstance(),input=await request.json();
    if(input.action==='matrix'){
      if(input.sku_style==='attributes'&&Array.isArray(input.axes)&&input.axes.length<=6){
        const values=await db.all(`SELECT a.name,v.value,v.short_code FROM product_attribute_values v JOIN product_attributes a ON a.id=v.attribute_id WHERE a.name IN (${input.axes.map(()=>'?').join(',')||'NULL'})`,input.axes.map(axis=>axis.name));
        input.axes=input.axes.map(axis=>({...axis,codes:Object.fromEntries(values.filter(v=>v.name===axis.name&&v.short_code).map(v=>[v.value,v.short_code]))}));
      }
      return NextResponse.json({rows:previewVariantMatrix(input)});
    }
    if(input.action==='barcodes'){
      if(!Number.isSafeInteger(input.count)||input.count<1||input.count>1000)return NextResponse.json({error:'Generate between 1 and 1000 internal barcodes'},{status:400});
      return NextResponse.json({barcodes:Array.from({length:input.count},()=>internalCatalogBarcode())});
    }
    // Cost editing is an explicit capability; CSV cost imports require it too.
    if(!isPermissionAllowedSync(auth.user.role,'retail_inventory.view_cost')){
      const costInput=input.rows?.some(row=>row.purchase_cost!==undefined)||(input.csv!=null&&parseCatalogCsv(input.csv).some(row=>(input.mapping?.purchase_cost||'purchase_cost') in row));
      const job=input.action==='apply'?await db.get('SELECT payload_json FROM retail_catalog_jobs WHERE id=? AND created_by=?',[input.job_id,auth.user.id]):null;
      if(costInput||(job&&JSON.parse(job.payload_json).cost_changed))return NextResponse.json({error:'Cost import/edit requires inventory cost access'},{status:403});
    }
    let result;
    if(input.action==='preview')result=await previewCatalogChange(db,input,auth.user.id);
    else if(input.action==='apply')result=await applyCatalogChange(db,input.job_id,auth.user.id);
    else return NextResponse.json({error:'Unsupported catalog action'},{status:400});
    return NextResponse.json(redactRetailCost(result,auth.user.role));
  }catch(error){return handleRouteError(error,'Could not save merchandising');}
}
