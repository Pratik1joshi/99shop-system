import {auditPriceChange} from '@/lib/retail-price-management.js';
import {lockCatalogWrite} from '@/lib/retail-catalog-lock.js';
import {commerceError} from '@/lib/retail-storefront.js';
export async function publishOnlineProducts(db,input,actorId){
  const ids=[...new Set(Array.isArray(input.product_ids)?input.product_ids.map(Number):[])].sort((a,b)=>a-b);
  if(!ids.length||ids.length>200||ids.some(id=>!Number.isSafeInteger(id)||id<1))throw commerceError('Select 1–200 products.');
  const reason=String(input.reason||'').trim();if(!reason||reason.length>500)throw commerceError('Enter a publishing reason of up to 500 characters.');
  const allowed=['enable','disable','feature','unfeature','category'];if(!allowed.includes(input.operation))throw commerceError('Choose a publishing action.');
  return db.transaction(async tx=>{
    await lockCatalogWrite(tx);
    const products=await tx.all(`SELECT id,name,is_available,online_enabled,online_slug,featured,online_category_id FROM products WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY id${tx.driver==='postgres'?' FOR UPDATE':''}`,ids);
    if(products.length!==ids.length)throw commerceError('A selected product no longer exists.',409);
    if(input.operation==='enable'&&products.some(p=>!Number(p.is_available)))throw commerceError('Archived products cannot be published.',409);
    if(input.operation==='category'&&!await tx.get('SELECT id FROM product_categories WHERE id=? AND online_enabled=1 AND is_active=1 AND merchandising_active=1',[Number(input.category_id)||-1]))throw commerceError('Choose an enabled online category.');
    for(const p of products){
      if(['enable','disable'].includes(input.operation))await tx.run('UPDATE products SET online_enabled=?,online_slug=COALESCE(online_slug,?),updated_at=CURRENT_TIMESTAMP WHERE id=?',[input.operation==='enable'?1:0,(p.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'product')+'-'+p.id,p.id]);
      if(['feature','unfeature'].includes(input.operation))await tx.run('UPDATE products SET featured=? WHERE id=?',[input.operation==='feature'?1:0,p.id]);
      if(input.operation==='category')await tx.run('UPDATE products SET online_category_id=? WHERE id=?',[Number(input.category_id),p.id]);
    }
    await auditPriceChange(tx,actorId,'ONLINE_PUBLISH',ids[0],products,{operation:input.operation,product_ids:ids,category_id:input.category_id},reason);
    return {count:ids.length};
  });
}
