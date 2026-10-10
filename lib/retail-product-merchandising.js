import { auditPriceChange } from '@/lib/retail-price-management.js';
const bad=message=>Object.assign(new Error(message),{status:400});
const text=(value,max=5000)=>{const s=String(value??'').trim();if(s.length>max)throw bad(`Text exceeds ${max} characters`);return s||null;};
function mediaUrl(value){const raw=text(value,2000);if(!raw)throw bad('Image URL required');if((/^\/(?:uploads|api\/media)\/menu\/[a-zA-Z0-9_.-]+$/.test(raw))&&!raw.includes('..')&&!raw.includes('\\'))return raw;try{const url=new URL(raw);if(url.protocol==='https:'&&!url.username&&!url.password)return url.href;}catch{}throw bad('Use an HTTPS image URL or an uploaded image path');}
const fields=['brand','online_title','online_summary','online_description','online_slug','seo_title','seo_description','online_enabled','featured','online_sort'];
export async function getProductMerchandising(db,id,{costAccess=false}={}){
  const product=await db.get(`SELECT id,name,${fields.join(',')} FROM menu_items WHERE id=?`,[id]);
  if(!product)throw bad('Product not found');
  const media=await db.all('SELECT * FROM retail_product_media WHERE product_id=? ORDER BY display_order,id LIMIT 100',[id]);
  const suppliers=await db.all('SELECT s.*,p.name AS supplier_name FROM retail_supplier_skus s JOIN suppliers p ON p.id=s.supplier_id JOIN menu_item_variants v ON v.id=s.variant_id WHERE v.menu_item_id=? ORDER BY s.preferred DESC,s.id LIMIT 1000',[id]);
  const history=costAccess?await db.all(`SELECT l.variant_id,l.quantity_received,l.purchase_unit,l.conversion_factor,l.unit_cost,l.net_amount,l.unit_cost-LAG(l.unit_cost) OVER (PARTITION BY l.variant_id,g.supplier_id,l.purchase_unit,l.conversion_factor ORDER BY g.receipt_date,g.id,l.id) AS cost_change,g.id AS receipt_id,g.grn_number,g.receipt_date,s.name AS supplier_name FROM goods_receipt_lines l JOIN goods_receipts g ON g.id=l.goods_receipt_id JOIN suppliers s ON s.id=g.supplier_id JOIN menu_item_variants v ON v.id=l.variant_id WHERE v.menu_item_id=? AND g.status='POSTED' ORDER BY g.receipt_date DESC,g.id DESC,l.id DESC LIMIT 100`,[id]):[];
  return {product,media,suppliers,history,brands:await db.all('SELECT id,name,active FROM retail_brands ORDER BY name LIMIT 500')};
}
export async function saveProductMerchandising(db,input,actorId){
  return db.transaction(async tx=>{
    const before=await getProductMerchandising(tx,input.product_id);
    const product={...before.product};
    for(const field of fields){if(input[field]===undefined)continue;if(['online_enabled','featured'].includes(field))product[field]=input[field]?1:0;else if(field==='online_sort'){product[field]=Number(input[field]);if(!Number.isSafeInteger(product[field]))throw bad('Display order must be an integer');}else product[field]=text(input[field],field==='online_description'?10000:field==='online_summary'?1000:200);}
    if(product.online_slug&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.online_slug))throw bad('Slug must contain lowercase letters, numbers and hyphens');
    if(product.online_enabled&&!product.online_slug)throw bad('Online products need a unique slug');
    if(product.brand)await tx.run('INSERT INTO retail_brands(name) VALUES (?) ON CONFLICT(name) DO NOTHING',[product.brand]);
    await tx.run(`UPDATE menu_items SET ${fields.map(field=>`${field}=?`).join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`,[...fields.map(field=>product[field]),product.id]);
    if(input.media!==undefined){
      if(!Array.isArray(input.media)||input.media.length>30)throw bad('Use at most 30 product images');
      await tx.run('DELETE FROM retail_product_media WHERE product_id=?',[product.id]);
      for(let index=0;index<input.media.length;index++){
        const image=input.media[index];
        if(image.variant_id&&!await tx.get('SELECT id FROM menu_item_variants WHERE id=? AND menu_item_id=?',[image.variant_id,product.id]))throw bad('Image SKU belongs to another product');
        await tx.run('INSERT INTO retail_product_media(product_id,variant_id,url,alt,display_order,is_primary) VALUES (?,?,?,?,?,?)',[product.id,image.variant_id||null,mediaUrl(image.url),text(image.alt,300)||'',index,index===0?1:0]);
      }
    }
    if(input.suppliers!==undefined){
      if(!Array.isArray(input.suppliers)||input.suppliers.length>1000)throw bad('Use at most 1000 supplier mappings');
      for(const item of input.suppliers){
        if(!await tx.get('SELECT id FROM menu_item_variants WHERE id=? AND menu_item_id=?',[item.variant_id,product.id]))throw bad('Supplier SKU belongs to another product');
        const quantity=item.minimum_order_quantity==null||item.minimum_order_quantity===''?null:Number(item.minimum_order_quantity);
        if(quantity!=null&&(!Number.isFinite(quantity)||quantity<=0))throw bad('Supplier minimum must be positive');
        await tx.run(`INSERT INTO retail_supplier_skus(variant_id,supplier_id,supplier_sku,supplier_barcode,minimum_order_quantity,preferred) VALUES (?,?,?,?,?,?) ON CONFLICT(variant_id,supplier_id) DO UPDATE SET supplier_sku=excluded.supplier_sku,supplier_barcode=excluded.supplier_barcode,minimum_order_quantity=excluded.minimum_order_quantity,preferred=excluded.preferred`,[item.variant_id,item.supplier_id,text(item.supplier_sku,160),text(item.supplier_barcode,128),quantity,item.preferred?1:0]);
      }
    }
    await auditPriceChange(tx,actorId,'PRODUCT_MERCHANDISING',product.id,before,await getProductMerchandising(tx,product.id),input.reason);
    return {id:product.id};
  });
}
