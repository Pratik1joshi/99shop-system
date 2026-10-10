'use client';
import { useParams } from 'next/navigation';
import AdminLayout from '@/components/admin/admin-layout';
import { SaleDetail } from '@/components/commerce/sales';
import Link from 'next/link';
import {useCapabilities} from '@/lib/use-capabilities';
export default function Page(){ const {id}=useParams(); const {can}=useCapabilities(); return <AdminLayout><div className="commerce-page">{can('warranty.view')&&<Link className="inline-flex min-h-11 items-center text-sm underline" href={'/admin/retail-after-sales?sale='+id}>Warranty & service for this sale</Link>}<SaleDetail id={id}/></div></AdminLayout>; }
