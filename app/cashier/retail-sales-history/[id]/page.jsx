'use client';
import { useParams } from 'next/navigation';
import AdminLayout from '@/components/admin/admin-layout';
import { SaleDetail } from '@/components/commerce/sales';
export default function Page(){ const {id}=useParams(); return <AdminLayout><div className="commerce-page"><SaleDetail id={id}/></div></AdminLayout>; }
