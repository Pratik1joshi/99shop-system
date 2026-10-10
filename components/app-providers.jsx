'use client';
import dynamic from 'next/dynamic';
import {usePathname} from 'next/navigation';
const StaffProviders=dynamic(()=>import('./staff-providers'));
export default function AppProviders({children}){
  const pathname=usePathname();
  return pathname==='/store'||pathname?.startsWith('/store/')?children:<StaffProviders>{children}</StaffProviders>;
}
