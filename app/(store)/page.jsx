import Link from 'next/link';
import { preload } from 'react-dom';
import KittyHero from '@/components/storefront/kitty-hero.jsx';
import ProductCard from '@/components/storefront/product-card.jsx';
import CategoryTile from '@/components/storefront/category-tile.jsx';
import { WhatsappIcon } from '@/components/storefront/icons.jsx';
import { getStorefrontCategories, getFeaturedProducts, isOnlineOrderingEnabled } from '@/lib/storefront.js';
import { LOGO_IMAGE, categoryHref } from '@/lib/storefront-links.js';
import { toPublicImageUrl } from '@/lib/public-image-url.js';
import { getSiteContent, whatsappLink } from '@/lib/site-content.js';
import { pageMetadata, siteOrigin } from '@/lib/seo.js';
import Database from '@/lib/db/index';

// The catalogue and the copy both change from the admin panel, so the
// storefront is rendered per request rather than cached at build time.
export const dynamic = 'force-dynamic';

const HOME_CATEGORY_LIMIT = 8;

export async function generateMetadata() {
  const [content, origin] = await Promise.all([getSiteContent(Database.getInstance()), siteOrigin()]);
  return pageMetadata({ origin, content, title: content['seo.home_title'], description: content['seo.home_description'], path: '/' });
}

export default async function StoreHomePage() {
  const [categories, content, onlineEnabled] = await Promise.all([
    getStorefrontCategories(),
    getSiteContent(Database.getInstance()),
    isOnlineOrderingEnabled(),
  ]);
  const featured = await getFeaturedProducts(8, { onlineOnly: onlineEnabled });
  const orderHref = whatsappLink(content, content['contact.order_message']);
  const firstCategory = categories[0];
  // Categories with their own cover photo lead; the rest are one click away on /categories.
  const cardCategories = [
    ...categories.filter((category) => category.hasCategoryCover),
    ...categories.filter((category) => !category.hasCategoryCover),
  ].slice(0, HOME_CATEGORY_LIMIT);
  // The kitty is a CSS background, which the browser finds late; it is also the largest thing on screen.
  preload(toPublicImageUrl(content['home.hero_image']) || '/storefront/kitty-hero.webp', { as: 'image', fetchPriority: 'high' });

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="reveal">
            <span className="eyebrow-tag">{content['home.eyebrow']}</span>
            <h1>
              {content['home.headline']}{' '}
              <span className="line2">{content['home.headline_accent']}</span>
            </h1>
            <p className="lede">{content['shop.intro']}</p>
            <div className="cta-row">
              {onlineEnabled ? <Link className="btn btn-pink" href="/store">Browse all products →</Link> : <a className="btn btn-pink" href={orderHref} target="_blank" rel="noopener"><WhatsappIcon size={17} />{content['home.cta_primary']}</a>}
              {firstCategory ? (
                <Link className="btn btn-outline" href={categoryHref(firstCategory, onlineEnabled)}>
                  {content['home.cta_secondary']}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="hero-visual">
            <svg
              className="sticker bob"
              style={{ top: '2%', right: '4%', width: '34px' }}
              viewBox="0 0 24 24"
              fill="var(--pink)"
              aria-hidden
            >
              <path d="M12 21s-7.5-4.6-10-9.3C.4 8.1 2.4 4.5 6 4.5c2 0 3.5 1 4 2.6.5-1.6 2-2.6 4-2.6 3.6 0 5.6 3.6 4 7.2C19.5 16.4 12 21 12 21Z" />
            </svg>
            <svg
              className="sticker bob-slow"
              style={{ bottom: '12%', left: '0%', width: '26px' }}
              viewBox="0 0 24 24"
              fill="var(--pink)"
              aria-hidden
            >
              <path d="M12 2l2.6 6.6L21 11l-6.4 2.4L12 20l-2.6-6.6L3 11l6.4-2.4L12 2Z" />
            </svg>
            <svg
              className="sticker bob"
              style={{ bottom: '26%', right: '-2%', width: '20px' }}
              viewBox="0 0 24 24"
              fill="var(--pink-deep)"
              aria-hidden
            >
              <path d="M12 2l2.6 6.6L21 11l-6.4 2.4L12 20l-2.6-6.6L3 11l6.4-2.4L12 2Z" />
            </svg>

            <KittyHero content={content} />
          </div>
        </div>
      </section>

      <section className="wrap" id="categories">
        <div className="cat-head">
          <span className="eyebrow-tag">Find your favorite little things</span>
          <h2>{content['home.categories_title']}</h2>
          <p>Explore the shop by what you love.</p>
        </div>
        <div className="cat-grid">
          {cardCategories.map((category) => <CategoryTile key={category.slug} category={category} onlineEnabled={onlineEnabled} />)}
        </div>
        {categories.length > cardCategories.length && (
          <div className="cat-all">
            <Link className="btn btn-outline" href="/categories">See all {categories.length} categories →</Link>
          </div>
        )}
        <Link className="cat-about" href="/about">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={toPublicImageUrl(content['shop.logo']) || LOGO_IMAGE} alt="" loading="lazy" />
          <span>{content['home.about_tile_label']}</span>
          <span aria-hidden="true">→</span>
        </Link>
      </section>

      {featured.length > 0 ? (
        <section className="wrap shop-section" id="favorites">
          <div className="section-head">
            <div className="tag">{content['home.featured_tag']}</div>
            <h2>{content['home.featured_title']}</h2>
          </div>
          <div className="feat-scroll">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} content={content} onlineEnabled={onlineEnabled} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="wrap shop-section" id="order">
        <div className="section-head">
          <div className="tag">{content['steps.tag']}</div>
          <h2>{content['steps.title']}</h2>
        </div>
        <div className="steps">
          <div className="step">
            <span className="num">1</span>
            <h3>{onlineEnabled ? 'Pick your favorites' : content['steps.one_title']}</h3>
            <p>{onlineEnabled ? 'Browse the shop, choose your options and add them to your bag.' : content['steps.one_body']}</p>
          </div>
          <div className="step">
            <span className="num">2</span>
            <h3>{onlineEnabled ? 'Check out as a guest' : content['steps.two_title']}</h3>
            <p>{onlineEnabled ? 'Enter your name, phone and delivery address, or choose store collection. No account is needed.' : content['steps.two_body']}</p>
          </div>
          <div className="step">
            <span className="num">3</span>
            <h3>{onlineEnabled ? 'Track your order' : content['steps.three_title']}</h3>
            <p>{onlineEnabled ? 'Place the order and keep the confirmation in this browser while the shop prepares it.' : content['steps.three_body']}</p>
          </div>
        </div>
        <p className="section-note" style={{ marginTop: '22px' }}>
          Delivery, pickup and common questions are on our <Link href="/contact">contact &amp; ordering page</Link>.
        </p>
      </section>
    </>
  );
}
