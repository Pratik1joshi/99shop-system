'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LOGO_IMAGE } from '@/lib/storefront-links.js';
import { InstagramIcon, TiktokIcon, WhatsappIcon } from './icons.jsx';

/** Same link the server builds; duplicated here so the header stays a client component. */
function waHref(content, message) {
  const number = String(content['contact.whatsapp_number'] || '').replace(/\D/g, '');
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/**
 * Storefront header: brand, category nav, socials, WhatsApp CTA and the
 * dark-mode toggle. Client-side only for the mobile panel and the toggle —
 * the category list and the copy are resolved on the server and passed in.
 */
export default function SiteHeader({ categories = [], content = {} }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  const orderHref = waHref(content, content['contact.order_message']);

  const links = [
    { href: '/', label: 'Home' },
    ...categories.map((c) => ({ href: `/shop/${c.slug}`, label: c.name })),
    { href: '/about', label: 'About' },
  ];

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      /* private mode — the toggle still works for this page view */
    }
  }

  const navLink = (link) => (
    <Link
      key={link.href}
      href={link.href}
      className={pathname === link.href ? 'active' : undefined}
      onClick={() => setMenuOpen(false)}
    >
      {link.label}
    </Link>
  );

  const socials = (
    <>
      <a
        className="icon-btn"
        href={content['contact.instagram_url']}
        target="_blank"
        rel="noopener"
        aria-label="Instagram"
      >
        <InstagramIcon size={16} />
      </a>
      <a
        className="icon-btn"
        href={content['contact.tiktok_url']}
        target="_blank"
        rel="noopener"
        aria-label="TikTok"
      >
        <TiktokIcon size={15} />
      </a>
      <a className="btn btn-pink btn-small" href={orderHref} target="_blank" rel="noopener">
        {content['home.cta_primary']}
      </a>
    </>
  );

  return (
    <header>
      <div className="navrow wrap">
        <Link className="brand" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_IMAGE} alt={`${content['shop.name']} logo`} />
          <span className="brandtext">
            <span className="name">{content['shop.short_name']}</span>
            <br />
            <span className="sub">{content['shop.brand_sub']}</span>
          </span>
        </Link>

        <nav className="links">{links.map(navLink)}</nav>

        <div className="nav-cta">
          {socials}
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
          >
            <svg className="moon" width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.7 14.9A8.5 8.5 0 1 1 9.1 3.3a7 7 0 1 0 11.6 11.6Z" />
            </svg>
            <svg className="sun" width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="4.5" />
              <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6M18.4 18.4l-1.6-1.6M7.2 7.2 5.6 5.6" />
              </g>
            </svg>
          </button>
          <button
            className="menu-toggle"
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
        </div>
      </div>

      <div className={`mobile-panel${menuOpen ? ' open' : ''}`}>
        <nav>{links.map(navLink)}</nav>
        <div className="mp-actions wrap">{socials}</div>
      </div>
    </header>
  );
}

export function WhatsappFloat({ content = {} }) {
  return (
    <a
      className="wa-float"
      href={waHref(content, content['contact.order_message'])}
      target="_blank"
      rel="noopener"
      aria-label={content['home.cta_primary']}
    >
      <span className="pulse" />
      <WhatsappIcon size={26} />
    </a>
  );
}
