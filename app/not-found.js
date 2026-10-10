import Link from 'next/link';
import './(store)/storefront.css';
import SiteHeader from '@/components/storefront/site-header.jsx';
import { WhatsappIcon } from '@/components/storefront/icons.jsx';
import { getStorefrontCategories } from '@/lib/storefront.js';
import { CONTENT_DEFAULTS, getSiteContent, whatsappLink } from '@/lib/site-content.js';
import Database from '@/lib/db/index';

/**
 * Branded 404 for every unknown address (Next sends the 404 status and a
 * noindex tag). Shoppers get a way back into the shop instead of a staff login
 * link; staff still have one at the bottom.
 */
export default async function NotFound() {
  let content = CONTENT_DEFAULTS;
  let categories = [];
  try {
    [content, categories] = await Promise.all([getSiteContent(Database.getInstance()), getStorefrontCategories()]);
  } catch {
    // A database hiccup must not turn the 404 page into a 500.
  }
  return (
    <div className="sf">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500;1,9..144,600&family=Quicksand:wght@500;600;700;800&display=swap" precedence="default" />
      <div className="gingham-strip" aria-hidden />
      <SiteHeader categories={categories} content={content} />
      <main className="wrap lost">
        <p className="code" aria-hidden>404</p>
        <h1>Oops, this page wandered off.</h1>
        <p>The link may be old or mistyped. Everything cute is still here, though.</p>
        <nav className="shop-links" aria-label="Back to the shop">
          <Link className="btn btn-pink" href="/">Home</Link>
          {categories.map((category) => <Link key={category.slug} className="btn btn-outline" href={`/shop/${category.slug}`}>{category.name}</Link>)}
          <Link className="btn btn-outline" href="/contact">Contact</Link>
          <a className="btn btn-outline" href={whatsappLink(content, content['contact.order_message'])} target="_blank" rel="noopener"><WhatsappIcon size={16} /> WhatsApp</a>
        </nav>
        <p style={{ marginTop: '32px', fontSize: '0.8rem' }}><Link href="/login">Staff sign in</Link></p>
      </main>
    </div>
  );
}
