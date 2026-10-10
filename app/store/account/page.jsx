import { Account } from '@/components/store/storefront';
import Link from 'next/link';
export const metadata={title:'Your account',robots:{index:false,follow:false}};
export default function Page(){return <><div className="mx-auto max-w-5xl px-4 pt-4"><Link className="inline-flex min-h-11 items-center text-sm underline" href="/store/account/warranty">Warranty & service requests</Link></div><Account/></>;}
