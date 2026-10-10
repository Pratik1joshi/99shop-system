import './storefront.css';
import SiteHeader, { WhatsappFloat } from '@/components/storefront/site-header.jsx';
import JsonLd from '@/components/storefront/json-ld.jsx';
import StoreAnalytics from '@/components/storefront/store-analytics.jsx';
import { getStorefrontCategories, isOnlineOrderingEnabled } from '@/lib/storefront.js';
import { getSiteContent } from '@/lib/site-content.js';
import SiteFooter from '@/components/storefront/site-footer.jsx';
import { businessGraph, pageMetadata, siteOrigin } from '@/lib/seo.js';
import Database from '@/lib/db/index';

// The shell reads the live category list and the owner's copy, so every
// storefront page renders per request.
export const dynamic = 'force-dynamic';

const GA_ID = /^G-[A-Z0-9]{4,20}$/;

/** Site-wide defaults. Every page overrides title, description and canonical. */
export async function generateMetadata() {
  const [content, origin] = await Promise.all([getSiteContent(Database.getInstance()), siteOrigin()]);
  const verification = String(content['seo.google_verification'] || '').replace(/[^A-Za-z0-9_-]/g, '');
  return {
    metadataBase: new URL(origin),
    ...pageMetadata({ origin, content, title: content['seo.home_title'], description: content['seo.home_description'], path: '/' }),
    applicationName: content['shop.name'],
    ...(verification ? { verification: { google: verification } } : {}),
  };
}

/**
 * Public storefront shell.
 *
 * Everything inside `.sf` is themed by `storefront.css`; the staff panels live
 * outside it and keep their own styling.
 */
export default async function StoreLayout({ children }) {
  const [categories, content, origin, onlineEnabled] = await Promise.all([
    getStorefrontCategories(),
    getSiteContent(Database.getInstance()),
    siteOrigin(),
    isOnlineOrderingEnabled(),
  ]);
  const gaId = String(content['seo.ga_id'] || '').trim().toUpperCase();

  return (
    <div className="sf">
      {/* Hoisted into <head> by React; a stylesheet link loads in parallel, unlike a CSS @import. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500;1,9..144,600&family=Quicksand:wght@500;600;700;800&display=swap" precedence="default" />
      <JsonLd data={businessGraph(origin, content, categories)} />
      {GA_ID.test(gaId) && <StoreAnalytics id={gaId} />}
      <div className="gingham-strip" aria-hidden />
      <SiteHeader categories={categories} content={content} onlineEnabled={onlineEnabled} />

      <main>{children}</main>

      <SiteFooter content={content} categories={categories} onlineEnabled={onlineEnabled} />

      <WhatsappFloat content={content} />
    </div>
  );
}
