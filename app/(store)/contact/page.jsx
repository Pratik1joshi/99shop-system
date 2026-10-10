import Link from 'next/link';
import { InstagramIcon, TiktokIcon, WhatsappIcon } from '@/components/storefront/icons.jsx';
import JsonLd from '@/components/storefront/json-ld.jsx';
import { getSiteContent, whatsappLink } from '@/lib/site-content.js';
import { breadcrumbLd, pageMetadata, siteOrigin, snippet } from '@/lib/seo.js';
import Database from '@/lib/db/index';
import { isOnlineOrderingEnabled } from '@/lib/storefront.js';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const [content, origin] = await Promise.all([getSiteContent(Database.getInstance()), siteOrigin()]);
  return pageMetadata({
    origin,
    content,
    title: `Contact & Ordering | ${content['shop.name']}, ${content['shop.city']}`,
    description: snippet(`Shop online or contact ${content['shop.name']} in ${content['shop.city']}. Browse products, place an order as a guest, or ask us on WhatsApp ${content['contact.phone_display']}.`),
    path: '/contact',
  });
}

/**
 * Every answer below is assembled from the owner's own site content, so
 * nothing here states a fact the shop has not published elsewhere.
 */
export default async function ContactPage() {
  const [content, origin, onlineEnabled] = await Promise.all([getSiteContent(Database.getInstance()), siteOrigin(), isOnlineOrderingEnabled()]);
  const orderHref = whatsappLink(content, content['contact.order_message']);
  const street = String(content['contact.street_address'] || '').trim();
  const hours = String(content['contact.hours'] || '').trim();
  const maps = /^https:\/\//.test(String(content['contact.maps_url'] || '').trim()) ? content['contact.maps_url'].trim() : '';
  const facebook = /^https:\/\//.test(String(content['contact.facebook_url'] || '').trim()) ? content['contact.facebook_url'].trim() : '';
  const where = [street, content['shop.address']].filter(Boolean).join(', ');

  const faqs = [
    [`Where is ${content['shop.name']} located?`, street ? `You'll find us at ${where}.` : `We're based in ${content['shop.address']}.`],
    ['How do I order?', onlineEnabled ? 'Browse the online shop, add items to your bag, and place your order with your name and phone. No account is required.' : `${content['steps.one_body']} ${content['steps.two_body']}`],
    [`Do you deliver around ${content['shop.city']}?`, content['contact.delivery_note']],
    ['Can I pick up my order?', onlineEnabled ? 'Yes. Choose store collection at checkout and follow the instructions on your confirmation.' : 'Yes. Ask for pickup when you message us.'],
    ["How can I check today's stock and prices?", onlineEnabled ? 'The online shop shows current options and prices. Stock and the final total are checked again at checkout.' : 'Message us on WhatsApp to confirm current stock and prices.'],
    ['Do you get new accessories regularly?', `Yes, new drops land every week. Follow ${content['contact.instagram_handle']} on Instagram or TikTok to see them first.`],
  ];

  return (
    <>
      <JsonLd data={breadcrumbLd(origin, [{ name: 'Home', path: '/' }, { name: 'Contact & ordering', path: '/contact' }])} />
      <div className="page-banner">
        <div className="wrap">
          <div className="inner">
            <nav className="crumb" aria-label="Breadcrumb">
              <Link href="/">Home</Link> / <span aria-current="page">Contact &amp; ordering</span>
            </nav>
            <h1>Contact {content['shop.short_name']}</h1>
            <p>{content['shop.name']} · {where}. {onlineEnabled ? 'Order online as a guest, or message us with a question.' : 'Message us on WhatsApp to order or ask a question.'}</p>
          </div>
        </div>
      </div>

      <section className="wrap" aria-label="Ways to reach us">
        <div className="contact-grid">
          <a className="contact-card" href={orderHref} target="_blank" rel="noopener">
            <div className="ci"><WhatsappIcon size={20} /></div>
            <h2>WhatsApp</h2>
            <p>{content['contact.phone_display']}</p>
          </a>
          <a className="contact-card" href={content['contact.instagram_url']} target="_blank" rel="noopener">
            <div className="ci"><InstagramIcon size={18} /></div>
            <h2>Instagram</h2>
            <p>{content['contact.instagram_handle']}</p>
          </a>
          <a className="contact-card" href={content['contact.tiktok_url']} target="_blank" rel="noopener">
            <div className="ci"><TiktokIcon size={17} /></div>
            <h2>TikTok</h2>
            <p>{content['contact.tiktok_handle']}</p>
          </a>
        </div>
      </section>

      <section className="wrap info-grid">
        <div className="info-card">
          <h2>How to order</h2>
          <ol>
            <li><strong>{onlineEnabled ? 'Choose your favorites' : content['steps.one_title']}.</strong> {onlineEnabled ? 'Browse published products and add your picks to the bag.' : content['steps.one_body']}</li>
            <li><strong>{onlineEnabled ? 'Check out as a guest' : content['steps.two_title']}.</strong> {onlineEnabled ? 'Enter your name and phone, then choose an available collection or delivery option.' : content['steps.two_body']}</li>
            <li><strong>{onlineEnabled ? 'Track your order' : content['steps.three_title']}.</strong> {onlineEnabled ? 'Keep your confirmation page open in this browser to see order updates.' : content['steps.three_body']}</li>
          </ol>
        </div>
        <div className="info-card">
          <h2>Delivery, pickup &amp; location</h2>
          <p>{content['contact.delivery_note']}</p>
          <p><strong>Where:</strong> {where}</p>
          {hours && <p><strong>Hours:</strong> {hours}</p>}
          {(maps || facebook) && <p>{maps && <a href={maps} target="_blank" rel="noopener">Open in Google Maps</a>}{maps && facebook && ' · '}{facebook && <a href={facebook} target="_blank" rel="noopener">Facebook page</a>}</p>}
        </div>
      </section>

      <section className="wrap" aria-labelledby="faq-heading">
        <div className="section-head">
          <div className="tag">🎀 Good to know</div>
          <h2 id="faq-heading">Questions we get a lot</h2>
        </div>
        <div className="faq">
          {faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
        <div className="cta-band">
          <h2 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>Ready to pick something cute?</h2>
          <p>{onlineEnabled ? 'Browse the shop and place your order online.' : 'Browse the shop, then send us your favourites.'}</p>
          <div className="shop-links" style={{ justifyContent: 'center' }}>
            {onlineEnabled ? <Link className="btn btn-pink" href="/store">Shop online →</Link> : <a className="btn btn-pink" href={orderHref} target="_blank" rel="noopener"><WhatsappIcon size={17} /> {content['home.cta_primary']}</a>}
            <Link className="btn btn-outline" href="/#categories">Browse the shop</Link>
          </div>
        </div>
      </section>
    </>
  );
}
