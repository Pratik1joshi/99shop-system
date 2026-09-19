import Link from 'next/link';
import { InstagramIcon, TiktokIcon, WhatsappIcon } from '@/components/storefront/icons.jsx';
import { LOGO_IMAGE, GENERIC_ORDER_MESSAGE } from '@/lib/storefront-links.js';
import { RESTAURANT, whatsappHref } from '@/lib/restaurant-info.js';

export const metadata = {
  title: `About & Contact — ${RESTAURANT.name}`,
  description: RESTAURANT.intro,
};

export default function AboutPage() {
  return (
    <>
      <div className="page-banner">
        <div className="wrap">
          <div className="inner">
            <div className="crumb">
              <Link href="/">Home</Link> / About &amp; Contact
            </div>
            <h1>A little shop, started with a big soft spot for cute things.</h1>
            <p>Everything you need to know about us — and the fastest ways to reach us.</p>
          </div>
        </div>
      </div>

      <section className="wrap about-grid">
        <div className="frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_IMAGE} alt={`${RESTAURANT.name} logo`} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.6rem', marginBottom: '14px' }}>Our story</h2>
          <p>
            {RESTAURANT.name} started in 2024 right here in {RESTAURANT.address.city}, with one
            simple idea: little accessories can make an ordinary day feel a bit softer and a lot
            cuter.
          </p>
          <p>
            Every clip, charm, polish and trinket is handpicked, not mass-dumped — we&apos;d rather
            bring you fewer pieces we genuinely love than everything under the sun. New drops land
            often, so it&apos;s always worth a peek.
          </p>
          <p className="sign">— Shahana, {RESTAURANT.shortName}</p>
        </div>
      </section>

      <section className="wrap">
        <div className="section-head" style={{ textAlign: 'center' }}>
          <div className="tag" style={{ justifyContent: 'center' }}>
            🎀 Get in touch
          </div>
          <h2>However you like to chat, we&apos;re there.</h2>
        </div>
        <div className="contact-grid">
          <a
            className="contact-card"
            href={whatsappHref(GENERIC_ORDER_MESSAGE)}
            target="_blank"
            rel="noopener"
          >
            <div className="ci">
              <WhatsappIcon size={20} />
            </div>
            <h4>WhatsApp</h4>
            <p>{RESTAURANT.phoneDisplay}</p>
          </a>
          <a
            className="contact-card"
            href={RESTAURANT.social.instagram}
            target="_blank"
            rel="noopener"
          >
            <div className="ci">
              <InstagramIcon size={18} />
            </div>
            <h4>Instagram</h4>
            <p>@99shop_surkhet</p>
          </a>
          <a className="contact-card" href={RESTAURANT.social.tiktok} target="_blank" rel="noopener">
            <div className="ci">
              <TiktokIcon size={17} />
            </div>
            <h4>TikTok</h4>
            <p>@99shop_surkhet</p>
          </a>
        </div>
      </section>
    </>
  );
}
