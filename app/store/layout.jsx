import { StoreShell } from '@/components/store/storefront';
import { getStorefrontCategories, isOnlineOrderingEnabled } from '@/lib/storefront.js';
import { getSiteContent } from '@/lib/site-content.js';
import Database from '@/lib/db/index';
import SiteFooter from '@/components/storefront/site-footer.jsx';
import '../(store)/storefront.css';
// The cart-based online shop repeats the main catalogue, so it stays out of
// search; the public product pages live at /shop and /products.
export const metadata={title:'Online shop',description:'Order from 99 Shop by Shahana for collection or delivery.',robots:{index:false,follow:true}};
export const dynamic = 'force-dynamic';
export default async function Layout({children}){
  const [categories,content,onlineEnabled]=await Promise.all([
    getStorefrontCategories(),
    getSiteContent(Database.getInstance()),
    isOnlineOrderingEnabled(),
  ]);
  return <>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500;1,9..144,600&family=Quicksand:wght@500;600;700;800&display=swap" precedence="default" />
    <StoreShell categories={categories} content={content} onlineEnabled={onlineEnabled}>{children}</StoreShell>
    <div className="sf store-shared-footer"><SiteFooter content={content} categories={categories} onlineEnabled={onlineEnabled} /></div>
  </>;
}
