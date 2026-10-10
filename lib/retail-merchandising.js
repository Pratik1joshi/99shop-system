import { shopBarcode } from './shop-barcode.js';
import { createHash } from 'node:crypto';
import { setVariantAttributes,findByBarcode,addBarcode } from '@/lib/product-catalog.js';
import { attributeSignature,parseCatalogCsv } from '@/lib/retail-catalog-matrix.js';
import { auditPriceChange } from '@/lib/retail-price-management.js';
import { lockCatalogWrite } from '@/lib/retail-catalog-lock.js';
const bad=(message,status=400)=>Object.assign(new Error(message),{status});
const clean=value=>String(value??'').trim();
const monetary=['price','mrp','wholesale_price','purchase_cost'];
const numeric=[...monetary,'wholesale_min_quantity','reorder_point','reorder_quantity','weight'];
const editable=['sku','variant_name',...numeric,'tracking_mode','merchandising_active'];
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const CATALOG_COLUMNS=['id','sku','variant_name','barcode','barcodes','price','mrp','wholesale_price','purchase_cost','wholesale_min_quantity','reorder_point','reorder_quantity','tracking_mode','merchandising_active','supplier_id','supplier_sku','attributes'];

export async function catalogRows(db,productId) {
  const variants=await db.all('SELECT * FROM product_variants WHERE product_id=? ORDER BY id LIMIT 1001',[productId]);
  if(variants.length>1000)throw bad('Use a smaller product batch');
  const attributes=await db.all(`SELECT av.variant_id,a.name,v.value FROM variant_attribute_values av JOIN product_attributes a ON a.id=av.attribute_id JOIN product_attribute_values v ON v.id=av.attribute_value_id JOIN product_variants sku ON sku.id=av.variant_id WHERE sku.product_id=? ORDER BY a.name`,[productId]);
  const barcodes=await db.all('SELECT b.variant_id,b.barcode FROM product_barcodes b JOIN product_variants v ON v.id=b.variant_id WHERE v.product_id=? ORDER BY b.id',[productId]);
  const suppliers=await db.all('SELECT s.variant_id,s.supplier_id,s.supplier_sku FROM retail_supplier_skus s JOIN product_variants v ON v.id=s.variant_id WHERE v.product_id=? ORDER BY s.preferred DESC,s.id',[productId]);
  return variants.map(v=>({id:Number(v.id),...Object.fromEntries(editable.map(key=>[key,v[key]])),supplier_id:suppliers.find(s=>Number(s.variant_id)===Number(v.id))?.supplier_id??null,supplier_sku:suppliers.find(s=>Number(s.variant_id)===Number(v.id))?.supplier_sku??'',barcode:v.barcode||'',attributes:Object.fromEntries(attributes.filter(a=>Number(a.variant_id)===Number(v.id)).map(a=>[a.name,a.value])),barcodes:[...new Set([v.barcode,...barcodes.filter(b=>Number(b.variant_id)===Number(v.id)).map(b=>b.barcode)].filter(Boolean))]}));
}

function normalizeRows(rawRows,existing) {
  if(!Array.isArray(rawRows)||!rawRows.length||rawRows.length>1000)throw bad('Edit between 1 and 1000 SKUs');
  const barcodeRows=new Map(),duplicateErrors=[];
  rawRows.forEach((row,index)=>{
    const extras=Array.isArray(row.barcodes)?row.barcodes:clean(row.barcodes).split('|');
    for(const barcode of new Set([row.barcode,...extras].map(clean).filter(Boolean))){
      if(barcodeRows.has(barcode))duplicateErrors.push(`Row ${index+1}: duplicate barcode ${barcode} from row ${barcodeRows.get(barcode)}; assign a unique barcode`);
      else barcodeRows.set(barcode,index+1);
    }
  });
  if(duplicateErrors.length)throw bad(duplicateErrors.join('; '));
  const ids=new Set(),skus=new Set(),signatures=new Set(),codes=new Set();
  return rawRows.map((raw,index)=>{
    const requestedSku=clean(raw.sku);
    const old=raw.id?existing.find(v=>v.id===Number(raw.id)):existing.find(v=>v.sku===requestedSku);
    const sku=raw.sku===undefined?old?.sku:requestedSku;
    if(raw.id&&!old)throw bad(`Row ${index+1}: SKU does not belong to this product`);
    if(old&&ids.has(old.id))throw bad(`Row ${index+1}: repeated SKU identity`);
    if(old)ids.add(old.id);
    if(!sku||sku.length>100||skus.has(sku))throw bad(`Row ${index+1}: duplicate or invalid SKU`);skus.add(sku);
    const row={...old,...Object.fromEntries(editable.filter(key=>raw[key]!==undefined).map(key=>[key,raw[key]])),id:old?.id||null,sku};
    row.variant_name=clean(row.variant_name);
    if(!row.variant_name||row.variant_name.length>240)throw bad(`Row ${index+1}: variant name is required`);
    for(const key of numeric){
      if(row[key]==null||row[key]===''){row[key]=['price','reorder_point','reorder_quantity'].includes(key)?0:key==='wholesale_min_quantity'?1:null;continue;}
      row[key]=Number(row[key]);
      if(!Number.isFinite(row[key])||row[key]<0||row[key]>999999999)throw bad(`Row ${index+1}: invalid ${key}`);
      if(monetary.includes(key))row[key]=Math.round((row[key]+Number.EPSILON)*100)/100;
    }
    if(!(row.wholesale_min_quantity>0))throw bad('Wholesale minimum must be positive');
    row.tracking_mode=row.tracking_mode||'none';
    if(!['none','batch','serial'].includes(row.tracking_mode))throw bad(`Row ${index+1}: invalid tracking mode`);
    row.merchandising_active=Number(row.merchandising_active??1);
    if(![0,1].includes(row.merchandising_active))throw bad('Active must be 0 or 1');
    let attrs=raw.attributes??old?.attributes??{};
    if(typeof attrs==='string'){try{attrs=JSON.parse(attrs||'{}');}catch{throw bad(`Row ${index+1}: attributes must be JSON`);}}
    if(!attrs||Array.isArray(attrs)||typeof attrs!=='object'||Object.keys(attrs).length>6)throw bad('Use at most six attributes');
    row.attributes=Object.fromEntries(Object.entries(attrs).map(([key,value])=>[clean(key),clean(value)]));
    if(Object.entries(row.attributes).some(([k,v])=>!k||!v||k.length>120||v.length>120))throw bad('Attribute names and values are required');
    row.merchandising_signature=Object.keys(row.attributes).length?attributeSignature(row.attributes):null;
    if(row.merchandising_signature&&signatures.has(row.merchandising_signature))throw bad(`Row ${index+1}: duplicate attribute combination`);
    if(row.merchandising_signature)signatures.add(row.merchandising_signature);
    const supplied=raw.barcodes==null?[]:Array.isArray(raw.barcodes)?raw.barcodes:clean(raw.barcodes).split('|');
    row.barcodes=[...new Set([...(old?.barcodes||[]),...supplied,raw.barcode].map(clean).filter(Boolean))];
    if(row.barcodes.length>20)throw bad('Use at most 20 barcodes per SKU');
    for(const barcode of row.barcodes){if(barcode.length>128||codes.has(barcode))throw bad(`Row ${index+1}: duplicate or invalid barcode ${barcode}`);codes.add(barcode);}
    row.barcode=clean(raw.barcode)||old?.barcode||row.barcodes[0]||null;
    row.supplier_id=raw.supplier_id===undefined?old?.supplier_id||null:Number(raw.supplier_id)||null;
    row.supplier_sku=clean(raw.supplier_sku??old?.supplier_sku);
    if(row.supplier_sku&&!row.supplier_id)throw bad(`Row ${index+1}: choose a supplier for its supplier SKU`);
    if(row.supplier_id&&(!Number.isSafeInteger(Number(row.supplier_id))||Number(row.supplier_id)<=0))throw bad(`Row ${index+1}: invalid supplier`);
    return row;
  });
}

async function validateRows(db,rows,existing,productId) {
  for(const row of rows){
    if(row.supplier_id&&!await db.get('SELECT id FROM suppliers WHERE id=?',[row.supplier_id]))throw bad(`Supplier for ${row.sku} does not exist`);
    const conflict=await db.get('SELECT id FROM product_variants WHERE sku=? AND id<>?',[row.sku,row.id||-1]);
    if(conflict)throw bad(`SKU ${row.sku} already exists`,409);
    const old=existing.find(v=>v.id===row.id);
    if(old&&(old.sku!==row.sku||old.tracking_mode!==row.tracking_mode||attributeSignature(old.attributes)!==attributeSignature(row.attributes))){
      const used=await db.get('SELECT id FROM inventory_movements WHERE variant_id=? LIMIT 1',[row.id])||await db.get('SELECT id FROM retail_sale_lines WHERE variant_id=? LIMIT 1',[row.id]);
      if(used)throw bad(`SKU ${old.sku} has transaction history; its identity and tracking cannot change`,409);
    }
    if(row.merchandising_signature&&existing.some(v=>v.id!==row.id&&attributeSignature(v.attributes)===row.merchandising_signature))throw bad(`Combination for ${row.sku} already exists`,409);
    for(const barcode of row.barcodes){
      const owner=await findByBarcode(db,barcode);
      if(owner&&!(row.id&&Number(owner.variantId)===row.id)&&!(owner.productId&&Number(owner.productId)===Number(productId)&&old?.barcode===barcode))throw bad(`Barcode ${barcode} already belongs to another SKU`,409);
    }
  }
}

export async function previewCatalogChange(db,{product_id,rows,csv,mapping,reason},actorId) {
  const product=await db.get('SELECT id FROM products WHERE id=?',[product_id]);if(!product)throw bad('Choose a product');
  if(csv!=null){const parsed=parseCatalogCsv(csv);rows=parsed.map(row=>Object.fromEntries(CATALOG_COLUMNS.filter(key=>mapping?!!mapping[key]:key in row).map(key=>[key,row[mapping?.[key]||key]])));}
  const existing=await catalogRows(db,product_id),normalized=normalizeRows(rows,existing);
  await validateRows(db,normalized,existing,product_id);
  if(!clean(reason))throw bad('Enter a change reason');
  const payload={product_id:Number(product_id),rows:normalized,before_hash:digest(existing),reason:clean(reason),cost_changed:normalized.some(row=>Number(row.purchase_cost||0)!==Number(existing.find(v=>v.id===row.id)?.purchase_cost||0))};
  const id=(await db.run('INSERT INTO retail_catalog_jobs(kind,created_by,payload_json) VALUES (?,?,?)',['CATALOG',actorId,JSON.stringify(payload)])).lastInsertRowid;
  return {id,rows:normalized.map(row=>({before:existing.find(v=>v.id===row.id)||null,after:row})),create_count:normalized.filter(r=>!r.id).length,update_count:normalized.filter(r=>r.id).length};
}

export async function applyCatalogChange(db,jobId,actorId) {
  return db.transaction(async tx=>{
    await lockCatalogWrite(tx);
    const lock=tx.driver==='postgres'?' FOR UPDATE':'';
    const job=await tx.get(`SELECT * FROM retail_catalog_jobs WHERE id=? AND created_by=?${lock}`,[jobId,actorId]);
    if(!job||job.kind!=='CATALOG')throw bad('Catalog preview not found',404);
    if(job.status==='APPLIED')return JSON.parse(job.result_json);
    const payload=JSON.parse(job.payload_json);
    // Serialize changes to the shared barcode namespace, including legacy primary columns.
    const existing=await catalogRows(tx,payload.product_id);
    if(digest(existing)!==payload.before_hash)throw bad('Catalog changed after preview. Refresh and preview again.',409);
    await validateRows(tx,payload.rows,existing,payload.product_id);
    const ids=[];
    for(const row of payload.rows){
      let id=row.id;
      if(id)await tx.run(`UPDATE product_variants SET ${editable.map(key=>`${key}=?`).join(',')},merchandising_signature=?,barcode=? WHERE id=?`,[...editable.map(key=>row[key]),row.merchandising_signature,row.barcode,id]);
      else id=(await tx.run(`INSERT INTO product_variants(product_id,${editable.join(',')},merchandising_signature,barcode,price_modifier,is_default) VALUES (?,${editable.map(()=>'?').join(',')},?,?,0,0)`,[payload.product_id,...editable.map(key=>row[key]),row.merchandising_signature,row.barcode])).lastInsertRowid;
      await setVariantAttributes(tx,id,row.attributes);
      if(row.supplier_id)await tx.run('INSERT INTO retail_supplier_skus(variant_id,supplier_id,supplier_sku) VALUES (?,?,?) ON CONFLICT(variant_id,supplier_id) DO UPDATE SET supplier_sku=excluded.supplier_sku',[id,row.supplier_id,row.supplier_sku||null]);
      for(const barcode of row.barcodes){if(barcode===row.barcode)continue;const owner=await findByBarcode(tx,barcode);if(!owner)await addBarcode(tx,{variantId:id,barcode,barcodeType:barcode.startsWith('INT-')?'internal':'other'});}
      ids.push(Number(id));
    }
    await tx.run("UPDATE products SET merchandising_type='variant' WHERE id=?",[payload.product_id]);
    await auditPriceChange(tx,actorId,'CATALOG_BULK',payload.product_id,existing,payload.rows,payload.reason);
    const result={ids,count:ids.length};
    await tx.run("UPDATE retail_catalog_jobs SET status='APPLIED',result_json=?,applied_at=CURRENT_TIMESTAMP WHERE id=?",[JSON.stringify(result),job.id]);
    return result;
  });
}
/** The shop's own number barcode (see lib/shop-barcode.js). */
export function internalCatalogBarcode(){return shopBarcode();}
