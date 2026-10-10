import fs from 'node:fs/promises';
import sharp from 'sharp';
import Database from '@/lib/db/index.js';
import {resolveUploadFile} from '@/lib/uploads.js';
import {rateLimitStore} from '@/lib/retail-public-security.js';
export const runtime='nodejs';
export async function GET(request){
  try{
    const params=new URL(request.url).searchParams,id=Number(params.get('id')),width=Number(params.get('w')||480);
    if(!Number.isSafeInteger(id)||id<1||![240,480,960].includes(width))return new Response(null,{status:404});
    const db=Database.getInstance();await rateLimitStore(db,'public-images',600);
    const row=await db.get(`SELECT m.url FROM retail_product_media m JOIN menu_items p ON p.id=m.product_id JOIN menu_categories c ON c.id=COALESCE(p.online_category_id,p.category_id) JOIN retail_online_settings s ON s.id=1 WHERE m.id=? AND p.online_enabled=1 AND p.is_available=1 AND c.online_enabled=1 AND c.is_active=1 AND c.merchandising_active=1 AND s.enabled=1`,[id]);
    if(!row||!/^\/(?:uploads|api\/media)\/menu\/[a-zA-Z0-9_.-]+$/.test(row.url))return new Response(null,{status:404});
    const path=resolveUploadFile(row.url);if(!path)return new Response(null,{status:404});
    const stat=await fs.stat(path);if(stat.size>5*1024*1024)return new Response(null,{status:413});
    const data=await sharp(await fs.readFile(path),{limitInputPixels:36000000}).rotate().resize({width,withoutEnlargement:true}).webp({quality:80}).toBuffer();
    return new Response(data,{headers:{'Content-Type':'image/webp','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
  }catch(error){return new Response(null,{status:error.status||404});}
}
