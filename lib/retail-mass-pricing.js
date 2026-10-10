import { createHash } from 'node:crypto';
import { lockCatalogWrite } from '@/lib/retail-catalog-lock.js';
import { auditPriceChange } from '@/lib/retail-price-management.js';
const bad=(message,status=400)=>Object.assign(new Error(message),{status});
const hash=rows=>createHash('sha256').update(JSON.stringify(rows.map(row=>[Number(row.id),Number(row.price)]))).digest('hex');
export async function previewMassPrices(db,input,actorId,{costAccess=false}={}){
  const where=['v.merchandising_active=1'],args=[];
  if(input.category_id){where.push('p.category_id=?');args.push(input.category_id);}
  if(input.brand){where.push('p.brand=?');args.push(String(input.brand));}
  if(input.supplier_id){where.push('EXISTS (SELECT 1 FROM retail_supplier_skus s WHERE s.variant_id=v.id AND s.supplier_id=?)');args.push(input.supplier_id);}
  if(Array.isArray(input.ids)&&input.ids.length){if(input.ids.length>1000)throw bad('Choose at most 1000 SKUs');where.push(`v.id IN (${input.ids.map(()=>'?').join(',')})`);args.push(...input.ids);}
  for(const [key,operator] of [['minimum_price','>='],['maximum_price','<=']])if(input[key]!==undefined&&input[key]!==''){if(!Number.isFinite(Number(input[key])))throw bad('Invalid price range');where.push(`v.price${operator}?`);args.push(Number(input[key]));}
  if(where.length===1)throw bad('Choose a category, brand, supplier, SKU selection or price range');
  const amount=Number(input.amount),step=Number(input.round_to??0.01);
  if(!['percent','fixed'].includes(input.mode)||!Number.isFinite(amount)||amount<(input.mode==='percent'?-100:0)||!Number.isFinite(step)||step<0.01||step>10000)throw bad('Invalid price adjustment or rounding increment');
  const rows=await db.all(`SELECT v.id,v.menu_item_id,v.sku,v.price,p.name,c.quantity_on_hand,c.carrying_value FROM menu_item_variants v JOIN menu_items p ON p.id=v.menu_item_id LEFT JOIN inventory_costs c ON c.variant_id=v.id WHERE ${where.join(' AND ')} ORDER BY v.id LIMIT 1001`,args);
  if(!rows.length||rows.length>1000)throw bad('Match between 1 and 1000 SKUs; narrow the filters');
  const changes=rows.map(row=>{const old=Number(row.price),price=Math.round(Math.round((input.mode==='fixed'?amount:old*(1+amount/100))/step)*step*100)/100;
    if(price<0||price>999999999)throw bad('Adjusted price is out of range');
    const cost=Number(row.quantity_on_hand)>0?Number(row.carrying_value)/Number(row.quantity_on_hand):null;
    return {id:Number(row.id),product_id:Number(row.menu_item_id),sku:row.sku,name:row.name,before_price:old,price,difference:Math.round((price-old)*100)/100,...(costAccess&&cost!=null?{before_margin:old?Math.round((old-cost)/old*10000)/100:null,after_margin:price?Math.round((price-cost)/price*10000)/100:null}:{})};});
  if(!String(input.reason||'').trim())throw bad('Enter a change reason');
  const payload={rows:changes,before_hash:hash(rows),reason:String(input.reason).trim()};
  const id=(await db.run("INSERT INTO retail_catalog_jobs(kind,created_by,payload_json) VALUES ('MASS_PRICE',?,?)",[actorId,JSON.stringify(payload)])).lastInsertRowid;
  return {id,rows:changes};
}
export async function applyMassPrices(db,input,actorId){
  return db.transaction(async tx=>{
    await lockCatalogWrite(tx);const lock=tx.driver==='postgres'?' FOR UPDATE':'';
    const job=await tx.get(`SELECT * FROM retail_catalog_jobs WHERE id=? AND created_by=?${lock}`,[input.job_id,actorId]);
    if(!job||job.kind!=='MASS_PRICE')throw bad('Mass-price preview not found',404);if(job.status==='APPLIED')return JSON.parse(job.result_json);
    const payload=JSON.parse(job.payload_json),ids=payload.rows.map(row=>row.id);
    const before=await tx.all(`SELECT id,price FROM menu_item_variants WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY id`,ids);
    if(hash(before)!==payload.before_hash)throw bad('Prices changed after preview; preview again',409);
    for(const row of payload.rows)await tx.run('UPDATE menu_item_variants SET price=? WHERE id=?',[row.price,row.id]);
    for(const id of new Set(payload.rows.map(row=>row.product_id)))await tx.run('UPDATE menu_items SET base_price=(SELECT price FROM menu_item_variants WHERE menu_item_id=? ORDER BY is_default DESC,id LIMIT 1) WHERE id=?',[id,id]);
    await auditPriceChange(tx,actorId,'MASS_PRICE',job.id,before,payload.rows,payload.reason);
    const result={count:ids.length};await tx.run("UPDATE retail_catalog_jobs SET status='APPLIED',result_json=?,applied_at=CURRENT_TIMESTAMP WHERE id=?",[JSON.stringify(result),job.id]);return result;
  });
}
