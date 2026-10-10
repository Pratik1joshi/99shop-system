import { cookies } from 'next/headers';
import { storeIdentity } from '@/lib/retail-public-security.js';
import { notFound } from 'next/navigation';
import Database from '@/lib/db/index.js';
import { publicProduct } from '@/lib/retail-storefront.js';
import { Product } from '@/components/store/storefront';
export const dynamic='force-dynamic';
async function load(params){const {slug}=await params;try{return await publicProduct(Database.getInstance(),slug);}catch(e){if(e.status===404||e.status===503)notFound();throw e;}}
export async function generateMetadata({params}){const p=await load(params);return {title:p.seo_title||p.title,description:p.seo_description||p.summary||p.title,openGraph:{title:p.seo_title||p.title,description:p.seo_description||p.summary||p.title,images:p.images.map(i=>({url:i.url,alt:i.alt||p.title}))},alternates:{canonical:`/store/product/${p.slug||p.id}`}};}
export default async function Page({params}){const publicData=await load(params),identity=await storeIdentity(Database.getInstance(),{cookies:await cookies()}),p=identity.customerId?await publicProduct(Database.getInstance(),publicData.slug||publicData.id,{customerId:identity.customerId}):publicData;const schema={'@context':'https://schema.org','@type':'Product',name:p.title,description:p.summary||p.title,image:p.images.map(i=>i.url),...(p.brand?{brand:{'@type':'Brand',name:p.brand}}:{})};return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(schema).replace(/</g,'\\u003c')}}/><Product initial={p}/></>;}
