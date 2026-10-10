import Link from 'next/link';
import { InstagramIcon, TiktokIcon, WhatsappIcon } from '@/components/storefront/icons.jsx';
import { LOGO_IMAGE } from '@/lib/storefront-links.js';
import { toPublicImageUrl } from '@/lib/public-image-url.js';
import JsonLd from '@/components/storefront/json-ld.jsx';
import { getStorefrontCategories } from '@/lib/storefront.js';
import { getSiteContent, paragraphs, whatsappLink } from '@/lib/site-content.js';
import { breadcrumbLd, pageMetadata, siteOrigin, snippet } from '@/lib/seo.js';
import Database from '@/lib/db/index';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const [content, origin] = await Promise.all([getSiteContent(Database.getInstance()), siteOrigin()]);
  return pageMetadata({
    origin,
    content,
    title: `About ${content['shop.name']} | ${content['shop.city']}`,
    description: snippet(paragraphs(content['about.story_body'])[0] || content['shop.intro']),
    path: '/about',
    image: content['shop.logo'],
  });
}

export default async function AboutPage() {
  const [content, categories, origin] = await Promise.all([getSiteContent(Database.getInstance()), getStorefrontCategories(), siteOrigin()]);

  return (
    <>
      <JsonLd data={breadcrumbLd(origin, [{ name: 'Home', path: '/' }, { name: 'About', path: '/about' }])} />
      <div className="page-banner">
        <div className="wrap">
          <div className="inner">
            <nav className="crumb" aria-label="Breadcrumb">
              <Link href="/">Home</Link> / <span aria-current="page">About</span>
            </nav>
            <h1>{content['about.banner_title']}</h1>
            <p>{content['about.banner_lede']}</p>
          </div>
        </div>
      </div>

      <section className="wrap about-grid" id="story">
        <div className="frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={toPublicImageUrl(content['shop.logo']) || LOGO_IMAGE} alt={`${content['shop.name']} logo`} />
          <div className="about-peek deco-cat" aria-hidden="true" style={{ '--img-cat3': `url("${toPublicImageUrl(content['home.float_image_right']) || '/storefront/kitty-bow.webp'}")` }} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.6rem', marginBottom: '14px' }}>{content['about.story_title']}</h2>
          {paragraphs(content['about.story_body']).map((para, index) => (
            // Owner-written prose with no stable ids of its own.
            <p key={index}>{para}</p>
          ))}
          <p className="sign">{content['about.signature']}</p>
          {categories.length > 0 && <nav className="shop-links" aria-label="Shop our collection">
            {categories.map((category) => <Link key={category.slug} className="btn btn-outline btn-small" href={`/shop/${category.slug}`}>{category.name}</Link>)}
          </nav>}
        </div>
      </section>

      <section className="wrap" id="contact">
        <div className="section-head" style={{ textAlign: 'center' }}>
          <div className="tag" style={{ justifyContent: 'center' }}>
            {content['about.contact_tag']}
          </div>
          <h2>{content['about.contact_title']}</h2>
          <p className="section-note" style={{ margin: '10px auto 0' }}>Delivery, pickup and FAQs are on the <Link href="/contact">contact &amp; ordering page</Link>.</p>
        </div>
        <div className="contact-grid">
          <a
            className="contact-card"
            href={whatsappLink(content, content['contact.order_message'])}
            target="_blank"
            rel="noopener"
          >
            <div className="ci">
              <WhatsappIcon size={20} />
            </div>
            <h3>WhatsApp</h3>
            <p>{content['contact.phone_display']}</p>
          </a>
          <a
            className="contact-card"
            href={content['contact.instagram_url']}
            target="_blank"
            rel="noopener"
          >
            <div className="ci">
              <InstagramIcon size={18} />
            </div>
            <h3>Instagram</h3>
            <p>{content['contact.instagram_handle']}</p>
          </a>
          <a
            className="contact-card"
            href={content['contact.tiktok_url']}
            target="_blank"
            rel="noopener"
          >
            <div className="ci">
              <TiktokIcon size={17} />
            </div>
            <h3>TikTok</h3>
            <p>{content['contact.tiktok_handle']}</p>
          </a>
        </div>
      </section>
    </>
  );
}
