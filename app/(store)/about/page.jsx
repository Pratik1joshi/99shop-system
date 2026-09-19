import Link from 'next/link';
import { InstagramIcon, TiktokIcon, WhatsappIcon } from '@/components/storefront/icons.jsx';
import { LOGO_IMAGE } from '@/lib/storefront-links.js';
import { getSiteContent, paragraphs, whatsappLink } from '@/lib/site-content.js';
import Database from '@/lib/db/index';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const content = await getSiteContent(Database.getInstance());
  return {
    title: `About & Contact — ${content['shop.name']}`,
    description: content['shop.intro'],
  };
}

export default async function AboutPage() {
  const content = await getSiteContent(Database.getInstance());

  return (
    <>
      <div className="page-banner">
        <div className="wrap">
          <div className="inner">
            <div className="crumb">
              <Link href="/">Home</Link> / About &amp; Contact
            </div>
            <h1>{content['about.banner_title']}</h1>
            <p>{content['about.banner_lede']}</p>
          </div>
        </div>
      </div>

      <section className="wrap about-grid">
        <div className="frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_IMAGE} alt={`${content['shop.name']} logo`} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.6rem', marginBottom: '14px' }}>{content['about.story_title']}</h2>
          {paragraphs(content['about.story_body']).map((para, index) => (
            // Owner-written prose with no stable ids of its own.
            <p key={index}>{para}</p>
          ))}
          <p className="sign">{content['about.signature']}</p>
        </div>
      </section>

      <section className="wrap">
        <div className="section-head" style={{ textAlign: 'center' }}>
          <div className="tag" style={{ justifyContent: 'center' }}>
            {content['about.contact_tag']}
          </div>
          <h2>{content['about.contact_title']}</h2>
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
            <h4>WhatsApp</h4>
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
            <h4>Instagram</h4>
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
            <h4>TikTok</h4>
            <p>{content['contact.tiktok_handle']}</p>
          </a>
        </div>
      </section>
    </>
  );
}
