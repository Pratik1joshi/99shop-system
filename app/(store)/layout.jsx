import Link from 'next/link';
import './storefront.css';
import SiteHeader, { WhatsappFloat } from '@/components/storefront/site-header.jsx';
import { InstagramIcon, TiktokIcon, WhatsappIcon } from '@/components/storefront/icons.jsx';
import { getStorefrontCategories } from '@/lib/storefront.js';
import { getSiteContent, whatsappLink } from '@/lib/site-content.js';
import Database from '@/lib/db/index';

// The shell reads the live category list and the owner's copy, so every
// storefront page renders per request.
export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const content = await getSiteContent(Database.getInstance());
  return {
    title: `${content['shop.name']} — ${content['shop.tagline']}`,
    description: content['shop.intro'],
  };
}

/**
 * Public storefront shell.
 *
 * Everything inside `.sf` is themed by `storefront.css`; the staff panels live
 * outside it and keep the plain admin styling.
 */
export default async function StoreLayout({ children }) {
  const [categories, content] = await Promise.all([
    getStorefrontCategories(),
    getSiteContent(Database.getInstance()),
  ]);
  const orderHref = whatsappLink(content, content['contact.order_message']);

  return (
    <div className="sf">
      <div className="gingham-strip" aria-hidden />
      <SiteHeader categories={categories} content={content} />

      <main>{children}</main>

      <footer>
        <div className="wrap">
          <div className="footer-top">
            <div className="footer-brand">
              <div className="name">{content['shop.name']}</div>
              <p>{content['shop.intro']}</p>
              <div className="footer-social">
                <a
                  href={content['contact.instagram_url']}
                  target="_blank"
                  rel="noopener"
                  aria-label="Instagram"
                >
                  <InstagramIcon size={16} />
                </a>
                <a
                  href={content['contact.tiktok_url']}
                  target="_blank"
                  rel="noopener"
                  aria-label="TikTok"
                >
                  <TiktokIcon size={15} />
                </a>
                <a href={orderHref} target="_blank" rel="noopener" aria-label="WhatsApp">
                  <WhatsappIcon size={15} />
                </a>
              </div>
            </div>

            <div className="footer-col">
              <h4>{content['footer.shop_heading']}</h4>
              {categories.map((category) => (
                <Link key={category.slug} href={`/shop/${category.slug}`}>
                  {category.name}
                </Link>
              ))}
            </div>

            <div className="footer-col">
              <h4>{content['footer.reach_heading']}</h4>
              <a href={orderHref} target="_blank" rel="noopener">
                WhatsApp: {content['contact.phone_display']}
              </a>
              <a href={content['contact.instagram_url']} target="_blank" rel="noopener">
                Instagram {content['contact.instagram_handle']}
              </a>
              <a href={content['contact.tiktok_url']} target="_blank" rel="noopener">
                TikTok {content['contact.tiktok_handle']}
              </a>
              <span>📍 {content['shop.address']}</span>
            </div>
          </div>

          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} {content['shop.name']}. All rights reserved.
            </span>
            <span>{content['footer.note']}</span>
          </div>
        </div>
      </footer>

      <WhatsappFloat content={content} />
    </div>
  );
}
