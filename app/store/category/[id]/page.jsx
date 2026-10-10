import {notFound} from 'next/navigation';
import Database from '@/lib/db/index.js';
import {Catalog} from '@/components/store/storefront';
export const dynamic='force-dynamic';
async function load(params){const {id}=await params;const row=await Database.getInstance().get('SELECT id,name FROM menu_categories WHERE id=? AND online_enabled=1 AND is_active=1 AND merchandising_active=1',[Number(id)||-1]);if(!row)notFound();return row;}
export async function generateMetadata({params}){const c=await load(params);return {title:c.name,alternates:{canonical:`/store/category/${c.id}`}};}
export default async function Page({params}){const c=await load(params);return <Catalog initialCategory={String(c.id)}/>;}
