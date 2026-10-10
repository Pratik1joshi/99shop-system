'use client';

import { useEffect } from 'react';
import Script from 'next/script';

/**
 * Google Analytics for the public site, only when the owner has entered a
 * measurement ID. Order-intent clicks (WhatsApp, Instagram, TikTok) are sent
 * as events from one delegated listener, so links need no extra markup.
 */
export default function StoreAnalytics({ id }) {
  useEffect(() => {
    const onClick = (event) => {
      const link = event.target.closest?.('a[href]');
      if (!link || typeof window.gtag !== 'function') return;
      const href = link.getAttribute('href') || '';
      const target = href.includes('wa.me/') ? 'whatsapp' : href.includes('instagram.com') ? 'instagram' : href.includes('tiktok.com') ? 'tiktok' : null;
      if (target) window.gtag('event', target === 'whatsapp' ? 'whatsapp_order_click' : 'social_click', { link_target: target, page_path: window.location.pathname, link_text: link.textContent?.trim().slice(0, 80) });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  return <>
    <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
    <Script id="ga-init" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');`}</Script>
  </>;
}
