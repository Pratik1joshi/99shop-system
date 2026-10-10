import { Orders } from '@/components/store/storefront';
export const metadata={title:'Order details',robots:{index:false,follow:false}};
export default async function Page({params}){const {id}=await params;return <Orders id={id}/>;}
