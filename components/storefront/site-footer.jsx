import Link from 'next/link';
import { InstagramIcon, TiktokIcon, WhatsappIcon } from './icons.jsx';
import { whatsappLink } from '@/lib/site-content.js';
import { categoryHref } from '@/lib/storefront-links.js';

const FOOTER_CATEGORY_LIMIT = 6;

export default function SiteFooter({ content, categories, onlineEnabled }) {
  const orderHref = whatsappLink(content, content['contact.order_message']);
  return <footer id="footer">
    <div className="wrap">
      <div className="footer-top">
        <div className="footer-brand">
          <p className="name">{content['shop.name']}</p>
          <p>{content['footer.description']}</p>
          <div className="footer-social">
            <a href={content['contact.instagram_url']} target="_blank" rel="noopener" aria-label={`${content['shop.name']} on Instagram`}><InstagramIcon size={16} /></a>
            <a href={content['contact.tiktok_url']} target="_blank" rel="noopener" aria-label={`${content['shop.name']} on TikTok`}><TiktokIcon size={15} /></a>
            <a href={orderHref} target="_blank" rel="noopener" aria-label={`Message ${content['shop.short_name']} on WhatsApp`}><WhatsappIcon size={15} /></a>
          </div>
        </div>
        <nav className="footer-col" aria-label="Shop categories">
          <h2>{content['footer.shop_heading']}</h2>
          {categories.slice(0, FOOTER_CATEGORY_LIMIT).map((category) => <Link key={category.slug} href={categoryHref(category, onlineEnabled)}>{category.name}</Link>)}
          {categories.length > FOOTER_CATEGORY_LIMIT && <Link className="footer-more" href="/categories">All {categories.length} categories →</Link>}
        </nav>
        <nav className="footer-col" aria-label="Explore">
          <h2>Explore</h2>
          {onlineEnabled && <Link href="/store">All products</Link>}
          {onlineEnabled && <Link href="/store/cart">Your bag</Link>}
          <Link href="/about">About us</Link>
          <Link href="/contact">Contact &amp; ordering</Link>
        </nav>
        <div className="footer-col">
          <h2>{content['footer.reach_heading']}</h2>
          <a href={orderHref} target="_blank" rel="noopener">WhatsApp: {content['contact.phone_display']}</a>
          <a href={content['contact.instagram_url']} target="_blank" rel="noopener">Instagram {content['contact.instagram_handle']}</a>
          <a href={content['contact.tiktok_url']} target="_blank" rel="noopener">TikTok {content['contact.tiktok_handle']}</a>
          <address>{[content['contact.street_address'], content['shop.address']].filter(Boolean).join(', ')}</address>
        </div>
      </div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} {content['shop.name']}. All rights reserved.</span><span>{content['footer.note']}</span></div>
    </div>
  </footer>;
}
