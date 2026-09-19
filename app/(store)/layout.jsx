import Link from 'next/link';
import './storefront.css';
import SiteHeader, { WhatsappFloat } from '@/components/storefront/site-header.jsx';
import { InstagramIcon, TiktokIcon, WhatsappIcon } from '@/components/storefront/icons.jsx';
import { getStorefrontCategories } from '@/lib/storefront.js';
import { GENERIC_ORDER_MESSAGE } from '@/lib/storefront-links.js';
import { RESTAURANT, whatsappHref } from '@/lib/restaurant-info.js';

// The shell reads the live category list, so every storefront page renders per
// request. Without this the layout is prerendered against a database that does
// not exist at build time.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${RESTAURANT.name} — ${RESTAURANT.tagline}`,
  description: RESTAURANT.intro,
};

/**
 * Public storefront shell.
 *
 * Everything inside `.sf` is themed by `storefront.css`; the staff panels live
 * outside it and keep the plain admin styling.
 */
export default async function StoreLayout({ children }) {
  const categories = await getStorefrontCategories();
  const orderHref = whatsappHref(GENERIC_ORDER_MESSAGE);

  return (
    <div className="sf">
      <div className="gingham-strip" aria-hidden />
      <SiteHeader categories={categories} />

      <main>{children}</main>

      <footer>
        <div className="wrap">
          <div className="footer-top">
            <div className="footer-brand">
              <div className="name">{RESTAURANT.name}</div>
              <p>{RESTAURANT.intro}</p>
              <div className="footer-social">
                <a
                  href={RESTAURANT.social.instagram}
                  target="_blank"
                  rel="noopener"
                  aria-label="Instagram"
                >
                  <InstagramIcon size={16} />
                </a>
                <a
                  href={RESTAURANT.social.tiktok}
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
              <h4>Shop</h4>
              {categories.map((category) => (
                <Link key={category.slug} href={`/shop/${category.slug}`}>
                  {category.name}
                </Link>
              ))}
            </div>

            <div className="footer-col">
              <h4>Reach us</h4>
              <a href={orderHref} target="_blank" rel="noopener">
                WhatsApp: {RESTAURANT.phoneDisplay}
              </a>
              <a href={RESTAURANT.social.instagram} target="_blank" rel="noopener">
                Instagram @99shop_surkhet
              </a>
              <a href={RESTAURANT.social.tiktok} target="_blank" rel="noopener">
                TikTok @99shop_surkhet
              </a>
              <span>📍 {RESTAURANT.address.full}</span>
            </div>
          </div>

          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} {RESTAURANT.name}. All rights reserved.</span>
            <span>Made with 🎀 in {RESTAURANT.address.city}</span>
          </div>
        </div>
      </footer>

      <WhatsappFloat />
    </div>
  );
}
