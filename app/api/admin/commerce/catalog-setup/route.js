import { ensureRetailCommerceSchema } from '@/lib/retail-commerce-schema.js';
import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth,handleRouteError } from '@/lib/api-guard.js';
import { listAttributes,ensureAttribute,ensureAttributeValue } from '@/lib/product-catalog.js';
import { auditPriceChange } from '@/lib/retail-price-management.js';
const bad=message=>Object.assign(new Error(message),{status:400});
export async function GET(request){try{
  const auth=await requireAuth(request,{roles:['admin','cashier'],permission:'catalog.manage'});if(auth.error)return auth.error;await ensureRetailCommerceSchema(Database.getInstance());const db=Database.getInstance();
  return NextResponse.json({attributes:await listAttributes(db),brands:await db.all('SELECT b.*,(SELECT COUNT(*) FROM products p WHERE p.brand=b.name) AS product_count FROM retail_brands b ORDER BY b.name LIMIT 500'),categories:await db.all('SELECT id,name,description,display_order,is_active,online_enabled,image_url FROM product_categories ORDER BY display_order,name LIMIT 500')});
}catch(error){return handleRouteError(error,'Could not load catalog setup');}}
export async function POST(request){try{
  const auth=await requireAuth(request,{roles:['admin','cashier'],permission:'catalog.manage'});if(auth.error)return auth.error;await ensureRetailCommerceSchema(Database.getInstance());const input=await request.json(),db=Database.getInstance(),name=String(input.name||'').trim();
  if(!name||name.length>160)throw bad('Enter a name of up to 160 characters');
  const result=await db.transaction(async tx=>{
    let id,before;
    if(input.action==='attribute'){
      if(!Array.isArray(input.values)||input.values.length>200)throw bad('Use at most 200 attribute values');
      const attribute=await ensureAttribute(tx,name);id=attribute.id;before=await tx.all('SELECT * FROM product_attribute_values WHERE attribute_id=?',[id]);
      const order=Number(input.display_order||0);if(!Number.isSafeInteger(order))throw bad('Display order must be an integer');
      await tx.run('UPDATE product_attributes SET display_order=?,online_filter=? WHERE id=?',[order,input.online_filter?1:0,id]);
      for(let i=0;i<input.values.length;i++){
        const row=input.values[i],value=String(row.value||'').trim(),short=String(row.short_code||'').trim(),swatch=String(row.swatch||'').trim();
        if(!value||value.length>120||short.length>20||(swatch&&!/^#[0-9a-f]{6}$/i.test(swatch)))throw bad(`Value ${i+1}: use a name, optional short code and #RRGGBB swatch`);
        const saved=await ensureAttributeValue(tx,id,value);
        await tx.run('UPDATE product_attribute_values SET short_code=?,swatch=?,display_order=? WHERE id=?',[short||null,swatch||null,i,saved.id]);
      }
    }else if(input.action==='brand'){
      before=input.id?await tx.get('SELECT * FROM retail_brands WHERE id=?',[input.id]):null;if(input.id&&!before)throw bad('Brand not found');
      const logo=String(input.logo_url||'').trim();if(logo&&!/^https:\/\//.test(logo))throw bad('Brand logo must use HTTPS');
      const args=[name,input.active===false||input.active===0?0:1,String(input.description||'').slice(0,2000),logo||null];id=before?.id;
      if(id){await tx.run('UPDATE retail_brands SET name=?,active=?,description=?,logo_url=? WHERE id=?',[...args,id]);await tx.run('UPDATE products SET brand=? WHERE brand=?',[name,before.name]);}
      else id=(await tx.run('INSERT INTO retail_brands(name,active,description,logo_url) VALUES (?,?,?,?)',args)).lastInsertRowid;
    }else if(input.action==='category'){
      before=input.id?await tx.get('SELECT id,name,description,display_order,is_active,online_enabled,image_url FROM product_categories WHERE id=?',[input.id]):null;if(input.id&&!before)throw bad('Category not found');
      const order=Number(input.display_order||0);if(!Number.isSafeInteger(order))throw bad('Display order must be an integer');
      // Only pictures uploaded through /api/uploads/products, same rule as the storefront logo.
      const image=String(input.image_url||'').trim();if(image&&!/^\/(?:uploads|api\/media)\/(?:products|menu)\/[a-zA-Z0-9_.-]+$/.test(image))throw bad('Upload the category picture here instead of pasting a link');
      const description=String(input.description||'').trim().slice(0,600)||null;
      const args=[name,order,input.active===false||input.active===0?0:1,input.online_enabled?1:0,image||null,description];id=before?.id;
      if(id)await tx.run('UPDATE product_categories SET name=?,display_order=?,is_active=?,online_enabled=?,image_url=?,description=? WHERE id=?',[...args,id]);
      else id=(await tx.run('INSERT INTO product_categories(name,display_order,is_active,online_enabled,image_url,description) VALUES (?,?,?,?,?,?)',args)).lastInsertRowid;
    }else throw bad('Unsupported catalog setup action');
    await auditPriceChange(tx,auth.user.id,`CATALOG_${input.action.toUpperCase()}`,id,before,input,input.reason);return {id};
  });return NextResponse.json(result);
}catch(error){return handleRouteError(error,'Could not save catalog setup');}}
/** Remove a list value, a whole list, a brand or an empty category. Values still on a live product version are kept. */
export async function DELETE(request){try{
  const auth=await requireAuth(request,{roles:['admin','cashier'],permission:'catalog.manage'});if(auth.error)return auth.error;const db=Database.getInstance();await ensureRetailCommerceSchema(db);
  const params=new URL(request.url).searchParams,kind=params.get('kind'),id=Number(params.get('id'));
  const conflict=message=>Object.assign(new Error(message),{status:409});
  await db.transaction(async tx=>{
    let before;
    if(kind==='attribute'||kind==='attribute_value'){
      const column=kind==='attribute'?'attribute_id':'attribute_value_id';
      before=await tx.get(kind==='attribute'?'SELECT * FROM product_attributes WHERE id=?':'SELECT * FROM product_attribute_values WHERE id=?',[id]);if(!before)throw bad('Already removed');
      const live=await tx.all(`SELECT p.name,COUNT(*) AS n FROM variant_attribute_values va JOIN product_variants v ON v.id=va.variant_id JOIN products p ON p.id=v.product_id WHERE va.${column}=? AND v.merchandising_active=1 GROUP BY p.id,p.name ORDER BY p.name LIMIT 4`,[id]);
      if(live.length)throw conflict(`Still used by ${live.slice(0,3).map(r=>`${r.name} (${r.n} version${Number(r.n)===1?'':'s'})`).join(', ')}${live.length>3?' and more':''}. Remove those versions from the product first.`);
      // Removed versions keep their name; only the dropdown link goes.
      await tx.run(`DELETE FROM variant_attribute_values WHERE ${column}=?`,[id]);
      if(kind==='attribute'){await tx.run('DELETE FROM product_attribute_values WHERE attribute_id=?',[id]);await tx.run('DELETE FROM product_attributes WHERE id=?',[id]);}
      else await tx.run('DELETE FROM product_attribute_values WHERE id=?',[id]);
    }else if(kind==='brand'){
      before=await tx.get('SELECT * FROM retail_brands WHERE id=?',[id]);if(!before)throw bad('Already removed');
      await tx.run('UPDATE products SET brand=NULL WHERE brand=?',[before.name]);
      await tx.run('DELETE FROM retail_brands WHERE id=?',[id]);
    }else if(kind==='category'){
      before=await tx.get('SELECT id,name FROM product_categories WHERE id=?',[id]);if(!before)throw bad('Already removed');
      const used=await tx.get('SELECT COUNT(*) AS n FROM products WHERE category_id=? OR online_category_id=?',[id,id]);
      if(Number(used.n))throw conflict(`${used.n} product${Number(used.n)===1?' is':'s are'} still in “${before.name}” (hidden ones count too). Move them to another category first.`);
      await tx.run('DELETE FROM product_categories WHERE id=?',[id]);
    }else throw bad('Unsupported catalog setup action');
    await auditPriceChange(tx,auth.user.id,`CATALOG_${kind.toUpperCase()}_DELETE`,id,before,null,`Removed ${before.name||before.value}`);
  });return NextResponse.json({ok:true});
}catch(error){return handleRouteError(error,'Could not remove this');}}
