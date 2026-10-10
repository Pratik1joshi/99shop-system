import { getDefaultLocation,getSellableStockBulk } from '@/lib/retail-inventory.js';
import { resolveRetailPrices } from '@/lib/retail-pricing.js';
import { quoteRetailSale } from '@/lib/retail-sales.js';
import { publicPrice,quoteFingerprint } from '@/lib/retail-public-price.js';
import { toPublicImageUrl } from '@/lib/public-image-url.js';
import { fallbackStorefrontImage } from '@/lib/storefront-seed-images.js';
export const commerceError=(message,status=400)=>Object.assign(new Error(message),{status});
export const money=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
const visible="p.online_enabled=1 AND p.is_available=1 AND (p.category_id IS NULL OR (c.online_enabled=1 AND c.merchandising_active=1 AND c.is_active=1))";
const placeholders=ids=>ids.map(()=>'?').join(',');
export async function onlineSettings(db) {
  const settings=await db.get('SELECT * FROM retail_online_settings WHERE id=1');
  if(!settings||!Number(settings.enabled))throw commerceError('Online shopping is currently unavailable.',503);
  return settings;
}
export async function availableOnline(db,ids,locationId) {
  if(!ids.length)return {};
  const stock=await getSellableStockBulk(db,ids,{locationId});
  for(const id of ids)stock[id]=Number(stock[id]||0);
  const reserved=await db.all(`SELECT variant_id,SUM(quantity) AS quantity FROM inventory_reservations WHERE location_id=? AND variant_id IN (${placeholders(ids)}) AND status='ACTIVE' AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP) GROUP BY variant_id`,[locationId,...ids]);
  for(const row of reserved)stock[row.variant_id]=Math.max(0,Number(stock[row.variant_id]||0)-Number(row.quantity));
  return stock;
}
export async function publicCatalog(db,{query='',category='',brand='',page=1,sort='featured',attributes='',min_price='',max_price='',availability=''}={}, {customerId=null}={}) {
  const settings=await onlineSettings(db),size=24,offset=(Math.min(1000,Math.max(1,Math.trunc(Number(page))||1))-1)*size;
  const pricedFilter=min_price!==''||max_price!==''||['price_asc','price_desc'].includes(sort)||availability==='in_stock';
  if([min_price,max_price].some(p=>p!==''&&(!Number.isFinite(Number(p))||Number(p)<0)))throw commerceError('Enter a valid price range.');
  const clauses=[visible],args=[];
  const q=String(query).trim().slice(0,100);
  // PostgreSQL uses its full-text index; SQLite (local development) falls back to LIKE.
  if(q){if(db.driver==='postgres'){clauses.push("(to_tsvector('simple',COALESCE(p.online_title,p.name)||' '||COALESCE(p.brand,'')||' '||COALESCE(p.online_summary,'')) @@ plainto_tsquery('simple',?) OR to_tsvector('simple',COALESCE(c.name,'')) @@ plainto_tsquery('simple',?) OR EXISTS(SELECT 1 FROM product_variants sv WHERE sv.product_id=p.id AND sv.merchandising_active=1 AND (to_tsvector('simple',COALESCE(sv.variant_name,'')) @@ plainto_tsquery('simple',?) OR EXISTS(SELECT 1 FROM variant_attribute_values va JOIN product_attributes a ON a.id=va.attribute_id JOIN product_attribute_values av ON av.id=va.attribute_value_id WHERE va.variant_id=sv.id AND a.online_filter=1 AND to_tsvector('simple',av.value) @@ plainto_tsquery('simple',?)))))");args.push(q,q,q,q);}else{clauses.push("(lower(COALESCE(p.online_title,p.name)||' '||COALESCE(p.brand,'')||' '||COALESCE(p.online_summary,'')) LIKE ? OR lower(COALESCE(c.name,'')) LIKE ? OR EXISTS(SELECT 1 FROM product_variants sv WHERE sv.product_id=p.id AND sv.merchandising_active=1 AND (lower(COALESCE(sv.variant_name,'')) LIKE ? OR EXISTS(SELECT 1 FROM variant_attribute_values va JOIN product_attributes a ON a.id=va.attribute_id JOIN product_attribute_values av ON av.id=va.attribute_value_id WHERE va.variant_id=sv.id AND a.online_filter=1 AND lower(av.value) LIKE ?))))");const like=`%${q.toLowerCase()}%`;args.push(like,like,like,like);}}
  const filters=[...new Set(String(attributes).split(',').filter(Boolean).map(Number))];
  if(filters.length>6||filters.some(id=>!Number.isSafeInteger(id)||id<1))throw commerceError('Choose at most six valid filters.');
  if(filters.length){clauses.push(`EXISTS(SELECT 1 FROM product_variants fv WHERE fv.product_id=p.id AND fv.merchandising_active=1 AND (SELECT COUNT(DISTINCT va.attribute_value_id) FROM variant_attribute_values va JOIN product_attributes a ON a.id=va.attribute_id WHERE va.variant_id=fv.id AND a.online_filter=1 AND va.attribute_value_id IN (${placeholders(filters)}))=?)`);args.push(...filters,filters.length);}
  if(category){clauses.push('c.id=?');args.push(Number(category)||-1);}
  if(brand){clauses.push('p.brand=?');args.push(String(brand).slice(0,100));}
  const rows=await db.all(`SELECT p.id,COALESCE(p.online_title,p.name) AS title,p.online_slug AS slug,p.online_summary AS summary,p.brand,c.name AS category,p.image_url AS fallback_image,
    v.id AS variant_id,v.mrp,(SELECT id FROM retail_product_media m WHERE m.product_id=p.id ORDER BY m.is_primary DESC,m.display_order,m.id LIMIT 1) AS image_id,(SELECT url FROM retail_product_media m WHERE m.product_id=p.id ORDER BY m.is_primary DESC,m.display_order,m.id LIMIT 1) AS image
    FROM products p LEFT JOIN product_categories c ON c.id=COALESCE(p.online_category_id,p.category_id) JOIN product_variants v ON v.id=(SELECT sv.id FROM product_variants sv WHERE sv.product_id=p.id AND sv.merchandising_active=1 ORDER BY sv.is_default DESC,sv.id LIMIT 1)
    WHERE ${clauses.join(' AND ')} ORDER BY ${sort==='name'?'p.name,p.id':'p.featured DESC,p.online_sort,p.id DESC'} LIMIT ? OFFSET ?`,[...args,pricedFilter?1001:size+1,pricedFilter?0:offset]);
  if(pricedFilter&&rows.length>1000)throw commerceError('Narrow your search or category to 1,000 products before filtering by price or availability.');
  const candidates=pricedFilter?rows:rows.slice(0,size),prices=[];
  for(let i=0;i<candidates.length;i+=200)prices.push(...await resolveRetailPrices(db,candidates.slice(i,i+200).map(r=>({variant_id:r.variant_id,quantity:1})),{channel:'online',customerId}));
  const location=await getDefaultLocation(db),stock=await availableOnline(db,candidates.map(r=>r.variant_id),location.id);
  const priceMap=new Map(prices.map(p=>[p.variant_id,p.unit_price]));
  let products=candidates.map(({image_id,fallback_image,...row})=>({...row,image:/^\/(?:uploads|api\/media)\/(?:products|menu)\//.test(row.image||'')?`/api/storefront/image?id=${image_id}&w=480`:toPublicImageUrl(row.image||fallback_image)||fallbackStorefrontImage(row.title),available:stock[row.variant_id]||0,price:priceMap.get(Number(row.variant_id))})),hasMore=rows.length>size;
  if(pricedFilter){
    products=products.filter(p=>(min_price===''||p.price>=Number(min_price))&&(max_price===''||p.price<=Number(max_price))&&(availability!=='in_stock'||p.available>0));
    if(['price_asc','price_desc'].includes(sort))products.sort((a,b)=>(sort==='price_asc'?a.price-b.price:b.price-a.price)||a.id-b.id);
    hasMore=products.length>offset+size;products=products.slice(offset,offset+size);
  }
  // Only categories that currently hold a listed product, so the filter follows the catalogue.
  const categories=await db.all(`SELECT c.id,c.name FROM product_categories c WHERE EXISTS(SELECT 1 FROM products p WHERE COALESCE(p.online_category_id,p.category_id)=c.id AND ${visible} AND EXISTS(SELECT 1 FROM product_variants v WHERE v.product_id=p.id AND v.merchandising_active=1)) ORDER BY c.display_order,c.name LIMIT 200`);
  const brands=await db.all(`SELECT DISTINCT p.brand FROM products p LEFT JOIN product_categories c ON c.id=COALESCE(p.online_category_id,p.category_id) WHERE ${visible} AND p.brand IS NOT NULL ORDER BY p.brand LIMIT 200`);
  const facets=await db.all(db.driver==='postgres'?`SELECT a.id,a.name,fv.id AS value_id,fv.value,fv.swatch FROM (SELECT id,name,display_order FROM product_attributes WHERE online_filter=1 ORDER BY display_order,id LIMIT 6) a CROSS JOIN LATERAL (SELECT av.id,av.value,av.swatch FROM product_attribute_values av WHERE av.attribute_id=a.id AND EXISTS(SELECT 1 FROM variant_attribute_values va JOIN product_variants v ON v.id=va.variant_id JOIN products p ON p.id=v.product_id LEFT JOIN product_categories c ON c.id=COALESCE(p.online_category_id,p.category_id) WHERE va.attribute_value_id=av.id AND v.merchandising_active=1 AND ${visible}) ORDER BY av.display_order,av.id LIMIT 40) fv ORDER BY a.display_order,a.id`:`SELECT id,name,value_id,value,swatch FROM (SELECT a.id,a.name,a.display_order,av.id AS value_id,av.value,av.swatch,ROW_NUMBER() OVER (PARTITION BY a.id ORDER BY av.display_order,av.id) AS rn FROM (SELECT id,name,display_order FROM product_attributes WHERE online_filter=1 ORDER BY display_order,id LIMIT 6) a JOIN product_attribute_values av ON av.attribute_id=a.id WHERE EXISTS(SELECT 1 FROM variant_attribute_values va JOIN product_variants v ON v.id=va.variant_id JOIN products p ON p.id=v.product_id LEFT JOIN product_categories c ON c.id=COALESCE(p.online_category_id,p.category_id) WHERE va.attribute_value_id=av.id AND v.merchandising_active=1 AND ${visible})) ranked WHERE rn<=40 ORDER BY display_order,id,rn`);
  return {products,has_more:hasMore,categories,facets,brands:brands.map(r=>r.brand),store:{name:settings.store_name,brand_color:settings.brand_color,logo_url:settings.logo_url,contact_text:settings.contact_text,hero_text:settings.hero_text,pickup_instructions:settings.pickup_instructions,return_policy:settings.return_policy}};
}
export async function publicProduct(db,slug,{page=1,customerId=null,preview=false}={}) {
  const settings=preview?await db.get('SELECT * FROM retail_online_settings WHERE id=1'):await onlineSettings(db);
  const p=await db.get(`SELECT p.id,COALESCE(p.online_title,p.name) AS title,p.online_slug AS slug,p.brand,p.online_summary AS summary,p.online_description AS description,p.seo_title,p.seo_description,p.image_url FROM products p LEFT JOIN product_categories c ON c.id=COALESCE(p.online_category_id,p.category_id) WHERE ${preview?'p.is_available=1':visible} AND (p.online_slug=? OR CAST(p.id AS TEXT)=?)`,[String(slug).slice(0,160),String(slug).slice(0,160)]);
  if(!p)throw commerceError('Product not found.',404);
  const rows=await db.all('SELECT id,variant_name,mrp FROM product_variants WHERE product_id=? AND merchandising_active=1 ORDER BY id LIMIT 101 OFFSET ?',[p.id,(Math.min(10,Math.max(1,Math.trunc(Number(page))||1))-1)*100]);
  const variants=rows.slice(0,100),ids=variants.map(v=>Number(v.id)),loc=await getDefaultLocation(db);
  const prices=ids.length?await resolveRetailPrices(db,ids.map(id=>({variant_id:id,quantity:1})),{channel:'online',customerId}):[];
  const stock=await availableOnline(db,ids,loc.id);
  const attrs=ids.length?await db.all(`SELECT va.variant_id,a.name,av.value,av.swatch FROM variant_attribute_values va JOIN product_attributes a ON a.id=va.attribute_id JOIN product_attribute_values av ON av.id=va.attribute_value_id WHERE va.variant_id IN (${placeholders(ids)}) ORDER BY a.display_order,a.id,av.display_order,av.id`,ids):[];
  const images=await db.all('SELECT id,variant_id,url,alt FROM retail_product_media WHERE product_id=? ORDER BY is_primary DESC,display_order,id LIMIT 100',[p.id]);
  const displayImages=images.map(({id,...image})=>({...image,url:!preview&&/^\/(?:uploads|api\/media)\/(?:products|menu)\//.test(image.url)?`/api/storefront/image?id=${id}&w=960`:image.url}));
  if(!displayImages.length){const fallback=toPublicImageUrl(p.image_url)||fallbackStorefrontImage(p.title);if(fallback)displayImages.push({variant_id:null,url:fallback,alt:p.title});}
  return {...p,return_policy:settings.return_policy,images:displayImages,has_more:rows.length>100,variants:variants.map(v=>({...v,price:publicPrice(prices.find(p=>p.variant_id===Number(v.id))),available:Math.max(0,stock[v.id]||0),attributes:attrs.filter(a=>Number(a.variant_id)===Number(v.id)).map(({name,value,swatch})=>({name,value,swatch}))}))};
}
export function cleanPublicLines(raw) {
  if(!Array.isArray(raw)||!raw.length||raw.length>50)throw commerceError('Choose between 1 and 50 items.');
  const totals=new Map();
  for(const row of raw){if(!row||typeof row!=='object'||Array.isArray(row))throw commerceError('Choose valid cart items.');const id=Number(row.variant_id??row.variantId),quantity=Number(row.quantity);if(!Number.isSafeInteger(id)||id<=0||!Number.isInteger(quantity)||quantity<1||quantity>99)throw commerceError('Choose a valid item and quantity from 1 to 99.');totals.set(id,(totals.get(id)||0)+quantity);}
  return [...totals].sort((a,b)=>a[0]-b[0]).map(([variant_id,quantity])=>{if(quantity>99)throw commerceError('Maximum 99 of each item.');return {variant_id,quantity};});
}
export async function quoteOnlineCart(db,input,{customerId=null}={}) {
  const settings=await onlineSettings(db),lines=cleanPublicLines(input.lines),ids=lines.map(l=>l.variant_id);
  const productRows=await db.all(`SELECT v.id AS variant_id,COALESCE(p.online_title,p.name) AS title,v.variant_name,p.image_url,
    COALESCE((SELECT m.id FROM retail_product_media m WHERE m.product_id=p.id AND m.variant_id=v.id ORDER BY m.is_primary DESC,m.display_order,m.id LIMIT 1),(SELECT m.id FROM retail_product_media m WHERE m.product_id=p.id AND m.variant_id IS NULL ORDER BY m.is_primary DESC,m.display_order,m.id LIMIT 1)) AS image_id,
    COALESCE((SELECT m.url FROM retail_product_media m WHERE m.product_id=p.id AND m.variant_id=v.id ORDER BY m.is_primary DESC,m.display_order,m.id LIMIT 1),(SELECT m.url FROM retail_product_media m WHERE m.product_id=p.id AND m.variant_id IS NULL ORDER BY m.is_primary DESC,m.display_order,m.id LIMIT 1),p.image_url) AS image
    FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN product_categories c ON c.id=COALESCE(p.online_category_id,p.category_id) WHERE v.id IN (${placeholders(ids)}) AND v.merchandising_active=1 AND ${visible}`,ids);
  const products=productRows.map(({image_id,image_url,image,...row})=>({...row,image:image_id&&/^\/(?:uploads|api\/media)\/(?:products|menu)\//.test(image||'')?`/api/storefront/image?id=${image_id}&w=480`:toPublicImageUrl(image||image_url)||fallbackStorefrontImage(row.title)}));
  if(products.length!==ids.length)throw commerceError('An item is no longer available.',409);
  const type=input.fulfillment_type||'PICKUP';
  if(!['PICKUP','DELIVERY'].includes(type)||type==='DELIVERY'&&!Number(settings.delivery_enabled))throw commerceError('This delivery option is unavailable.');
  const coupon=String(input.coupon_code||'').trim().slice(0,80);
  const quote=await quoteRetailSale(db,{lines,customer_id:customerId,coupon_code:coupon},{channel:'online'});
  const fee=type==='DELIVERY'&&!(settings.free_delivery_threshold!=null&&quote.subtotal-quote.discount>=Number(settings.free_delivery_threshold))?Number(settings.delivery_fee):0;
  const location=await getDefaultLocation(db),stock=await availableOnline(db,ids,location.id);
  return {quote_token:quoteFingerprint({...quote,delivery_charge:fee,total:money(quote.total+fee)}),subtotal:money(quote.subtotal+quote.promoDiscount),discount:money(quote.discount+quote.promoDiscount),tax:quote.tax,delivery_charge:fee,total:money(quote.total+fee),coupon_code:coupon,fulfillment_type:type,location_id:location.id,
    lines:lines.map(l=>({...l,...products.find(p=>Number(p.variant_id)===l.variant_id),discount:Number(quote.line_totals.find(t=>Number(t.variant_id)===l.variant_id)?.discount_amount||0),line_total:Number(quote.line_totals.find(t=>Number(t.variant_id)===l.variant_id)?.net_amount||0),price:publicPrice(quote.pricing.find(p=>p.variant_id===l.variant_id)),available:stock[l.variant_id]||0})),
    promotions:quote.applied_promotions.map(p=>({name:p.name,discount:p.discount})),conflicts:lines.filter(l=>l.quantity>(stock[l.variant_id]||0)).map(()=> 'This item is no longer available.'),
    delivery_enabled:!!Number(settings.delivery_enabled),payment_methods:Number(settings.manual_payment_enabled)?['cash','online']:['cash'],payment_instructions:settings.payment_instructions,pickup_instructions:settings.pickup_instructions};
}
