'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LOGO_IMAGE, categoryHref } from '@/lib/storefront-links.js';
import { toPublicImageUrl } from '@/lib/public-image-url.js';
import { WhatsappIcon } from './icons.jsx';
import { readBag } from '@/lib/store-bag.js';

const MOBILE_CATEGORY_LIMIT = 8;

/** Same link the server builds; duplicated here so the header stays a client component. */
function waHref(content, message) {
  const number = String(content['contact.whatsapp_number'] || '').replace(/\D/g, '');
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Storefront header with compact primary navigation and a category menu. */
export default function SiteHeader({ categories = [], content = {}, onlineEnabled = false }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const categoriesRef = useRef(null);
  useEffect(() => {
    const closeOutside = (event) => { if (!categoriesRef.current?.contains(event.target)) setCategoriesOpen(false); };
    const closeEscape = (event) => { if (event.key === 'Escape') setCategoriesOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape); };
  }, []);
  const [bagCount, setBagCount] = useState(0);
  useEffect(() => {
    const update = () => setBagCount(readBag().reduce((sum, line) => sum + line.quantity, 0));
    update();
    window.addEventListener('shop-bag-change', update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener('shop-bag-change', update); window.removeEventListener('storage', update); };
  }, []);
  const [dark, setDark] = useState(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });

  const orderHref = waHref(content, content['contact.order_message']);

  const links = [
    { href: '/', label: 'Home' },
    { href: '/store', label: 'All products' },
    { href: '/contact', label: 'Contact' },
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
      className={pathname === link.href || (link.href === '/store' && (pathname.startsWith('/products/') || pathname.startsWith('/store/product/') || pathname.startsWith('/store/category/'))) ? 'active' : undefined}
      aria-current={pathname === link.href ? 'page' : undefined}
      onClick={() => setMenuOpen(false)}
    >
      {link.label}
    </Link>
  );

  const categoryLink = (category, close) => {
    const href = categoryHref(category, onlineEnabled);
    return <Link key={category.slug} href={href} aria-current={pathname === href ? 'page' : undefined} onClick={close}>{category.name}{category.productCount > 0 && <small>{category.productCount}</small>}</Link>;
  };
  const allCategoriesLink = (close) => <Link className="category-all" href="/categories" aria-current={pathname === '/categories' ? 'page' : undefined} onClick={close}>See all {categories.length} categories →</Link>;
  // A long list reads better in columns; a short one stays a single list.
  const menuColumns = categories.length > 16 ? 3 : categories.length > 6 ? 2 : 1;

  const categoryMenu = (mobile = false) => mobile ? (
    <div className="mobile-categories">
      <span>Categories</span>
      <div>{categories.slice(0, MOBILE_CATEGORY_LIMIT).map((category) => categoryLink(category, () => setMenuOpen(false)))}</div>
      {categories.length > MOBILE_CATEGORY_LIMIT && allCategoriesLink(() => setMenuOpen(false))}
    </div>
  ) : (
    <div className={`category-menu${pathname.startsWith('/shop/') || pathname.startsWith('/store/category/') || pathname === '/categories' ? ' active' : ''}`} ref={categoriesRef}>
      <button className="category-trigger" type="button" aria-expanded={categoriesOpen} aria-controls="store-category-menu" onClick={() => setCategoriesOpen((open) => !open)}>
        Categories <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none"><path d="m3.5 6 4.5 4 4.5-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {categoriesOpen && <div className="category-popover" id="store-category-menu" style={{ '--menu-cols': menuColumns }}>
        <div className="category-popover-grid">{categories.map((category) => categoryLink(category, () => setCategoriesOpen(false)))}</div>
        {allCategoriesLink(() => setCategoriesOpen(false))}
      </div>}
    </div>
  );

  const socials = (
    <>
      {onlineEnabled ? <Link className="btn btn-pink btn-small" href="/store/cart">Bag{bagCount > 0 ? ` (${bagCount})` : ''}</Link> : <a className="btn btn-pink btn-small" href={orderHref} target="_blank" rel="noopener">{content['home.cta_primary']}</a>}
    </>
  );

  return (
    <header>
      <div className="navrow wrap">
        <Link className="brand" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={toPublicImageUrl(content['shop.logo']) || LOGO_IMAGE} alt={`${content['shop.name']} logo`} />
          <span className="brandtext">
            <span className="name">{content['shop.short_name']}</span>
            <br />
            <span className="sub">{content['shop.brand_sub']}</span>
          </span>
        </Link>

        <nav className="links" aria-label="Main">{navLink(links[0])}{categoryMenu()}{links.slice(1).map(navLink)}</nav>

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
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
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
        <nav aria-label="Main">{navLink(links[0])}{categoryMenu(true)}{links.slice(1).map(navLink)}</nav>
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
