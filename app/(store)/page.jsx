import Link from 'next/link';
import BunnyMascot from '@/components/storefront/bunny-mascot.jsx';
import ProductCard from '@/components/storefront/product-card.jsx';
import { WhatsappIcon } from '@/components/storefront/icons.jsx';
import { getStorefrontCategories, getFeaturedProducts } from '@/lib/storefront.js';
import { GENERIC_ORDER_MESSAGE } from '@/lib/storefront-links.js';
import { RESTAURANT, whatsappHref } from '@/lib/restaurant-info.js';

// The catalogue changes whenever the shop adds a product at the till, so the
// storefront is rendered per request rather than cached at build time.
export const dynamic = 'force-dynamic';

export default async function StoreHomePage() {
  const [categories, featured] = await Promise.all([
    getStorefrontCategories(),
    getFeaturedProducts(8),
  ]);
  const orderHref = whatsappHref(GENERIC_ORDER_MESSAGE);
  const firstCategory = categories[0];

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="reveal">
            <span className="eyebrow-tag">🎀 New drops every week</span>
            <h1>
              Cute. Cozy.<span className="line2">Kawaii-fied.</span>
            </h1>
            <p className="lede">{RESTAURANT.intro}</p>
            <div className="cta-row">
              <a className="btn btn-pink" href={orderHref} target="_blank" rel="noopener">
                <WhatsappIcon size={17} />
                Order on WhatsApp
              </a>
              {firstCategory ? (
                <Link className="btn btn-outline" href={`/shop/${firstCategory.slug}`}>
                  Explore Shop
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

            <BunnyMascot />
          </div>
        </div>
      </section>

      <section className="wrap">
        <div className="cat-head">
          <h2>Categories</h2>
        </div>
        <div className="cat-grid">
          {categories.map((category) => (
            <Link className="cat-tile" key={category.slug} href={`/shop/${category.slug}`}>
              <div className="imgbox">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={category.image} alt={category.name} />
                <div className="overlay" />
              </div>
              <span className="label">
                {category.name} <span className="arrow">→</span>
              </span>
            </Link>
          ))}
          <Link className="cat-tile" href="/about">
            <div className="imgbox">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/storefront/99-shop-by-shahana-logo.jpg" alt={`About ${RESTAURANT.shortName}`} />
              <div className="overlay" />
            </div>
            <span className="label">
              About &amp; Contact <span className="arrow">→</span>
            </span>
          </Link>
        </div>
      </section>

      {featured.length > 0 ? (
        <section className="wrap shop-section">
          <div className="section-head">
            <div className="tag">🎀 New &amp; Loved</div>
            <h2>A few current favorites</h2>
          </div>
          <div className="feat-scroll">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="wrap shop-section" id="order">
        <div className="section-head">
          <div className="tag">🎀 How to Order</div>
          <h2>Three cute steps, that&apos;s it.</h2>
        </div>
        <div className="steps">
          <div className="step">
            <span className="num">1</span>
            <h3>Pick your favorites</h3>
            <p>
              Tap &ldquo;Order →&rdquo; under any item you love, or browse the whole shop and
              message us your picks.
            </p>
          </div>
          <div className="step">
            <span className="num">2</span>
            <h3>Chat &amp; confirm</h3>
            <p>
              We&apos;ll reply with stock and photos, then confirm your order and delivery or
              pickup details.
            </p>
          </div>
          <div className="step">
            <span className="num">3</span>
            <h3>Receive it, cutely wrapped</h3>
            <p>
              Pay on delivery around {RESTAURANT.address.city}, or arrange pickup. Every order is
              packed with care.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
