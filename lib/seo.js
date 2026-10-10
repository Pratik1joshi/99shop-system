import { headers } from 'next/headers';
import { toPublicImageUrl } from '@/lib/public-image-url.js';
import { LOGO_IMAGE } from '@/lib/storefront-links.js';

/**
 * Search metadata and structured data for the public storefront.
 *
 * Everything here is built from the owner's site content and the live
 * catalogue. Nothing is invented: optional facts (street address, hours, maps
 * link, Facebook) are only emitted when the owner has filled them in.
 */

const trimSlash = (value) => String(value || '').trim().replace(/\/+$/, '');

/**
 * Canonical origin. NEXT_PUBLIC_SITE_URL wins once it is set to the real
 * domain; until then the request's own host is used, so canonicals never
 * point at a placeholder domain.
 */
export async function siteOrigin() {
  const configured = trimSlash(process.env.NEXT_PUBLIC_SITE_URL);
  if (/^https?:\/\//.test(configured) && !/example\.(com|org)/.test(configured)) return configured;
  const h = await headers();
  const host = (h.get('x-forwarded-host') || h.get('host') || 'localhost:3000').split(',')[0].trim();
  const proto = (h.get('x-forwarded-proto') || (/^(localhost|127\.)/.test(host) ? 'http' : 'https')).split(',')[0].trim();
  return `${proto}://${host}`;
}

export function absoluteUrl(origin, pathOrUrl) {
  const value = toPublicImageUrl(pathOrUrl) || pathOrUrl;
  if (!value) return null;
  return /^https?:\/\//.test(value) ? value : `${origin}${value.startsWith('/') ? '' : '/'}${value}`;
}

/** Same metadata shape for every public page: canonical, Open Graph and Twitter card. */
export function pageMetadata({ origin, content, title, description, path, image, imageAlt, type = 'website' }) {
  const url = `${origin}${path}`;
  const images = [{ url: image ? absoluteUrl(origin, image) : `${origin}/og`, alt: imageAlt || content['shop.name'], ...(image ? {} : { width: 1200, height: 630 }) }];
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { type, url, title, description, siteName: content['shop.name'], locale: 'en_NP', images },
    twitter: { card: 'summary_large_image', title, description, images: images.map((i) => i.url) },
  };
}

/**
 * Search description from the owner's short copy. One-line product or
 * category notes are too thin for a result snippet, so a plain sentence about
 * where and how to buy is added; long copy is used as written.
 */
export function describe(text, content) {
  const own = String(text || '').replace(/\s+/g, ' ').trim();
  if (own.length >= 110) return snippet(own);
  const where = `From ${content['shop.name']} in ${content['shop.city']}, order easily on WhatsApp.`;
  return snippet(own ? `${own.replace(/[.!]?$/, '.')} ${where}` : where);
}

/** Clip copy to a search-snippet length on a word boundary. */
export function snippet(text, max = 158) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

const phoneE164 = (content) => {
  const digits = String(content['contact.whatsapp_number'] || '').replace(/\D/g, '');
  return digits ? `+${digits}` : undefined;
};

/** The one business entity every page points at by @id. */
export function businessGraph(origin, content, categories = []) {
  const street = String(content['contact.street_address'] || '').trim();
  const sameAs = [content['contact.instagram_url'], content['contact.tiktok_url'], content['contact.facebook_url'], content['contact.maps_url']]
    .map((value) => String(value || '').trim()).filter((value) => /^https:\/\//.test(value));
  const logo = absoluteUrl(origin, content['shop.logo'] || LOGO_IMAGE);
  const business = {
    // A street address means customers can visit: a Store. Otherwise an online shop serving the city.
    '@type': street ? 'Store' : 'OnlineStore',
    '@id': `${origin}/#business`,
    name: content['shop.name'],
    alternateName: [content['shop.short_name'], '99shop'].filter(Boolean),
    url: `${origin}/`,
    logo,
    image: logo,
    description: content['shop.intro'],
    telephone: phoneE164(content),
    address: {
      '@type': 'PostalAddress',
      ...(street ? { streetAddress: street } : {}),
      addressLocality: content['shop.city'] || 'Surkhet',
      addressCountry: 'NP',
    },
    areaServed: { '@type': 'City', name: `${content['shop.city'] || 'Surkhet'}, Nepal` },
    sameAs,
    ...(categories.length ? { knowsAbout: categories.map((c) => c.name) } : {}),
  };
  const website = {
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    url: `${origin}/`,
    name: content['shop.name'],
    alternateName: content['shop.short_name'],
    inLanguage: 'en',
    publisher: { '@id': business['@id'] },
  };
  return { '@context': 'https://schema.org', '@graph': [business, website] };
}

export function breadcrumbLd(origin, items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: `${origin}${item.path}` })),
  };
}

export function itemListLd(origin, name, products) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListElement: products.map((product, index) => ({ '@type': 'ListItem', position: index + 1, url: `${origin}/products/${product.slug}`, name: product.name })),
  };
}

/**
 * Product markup only when a real price is shown: Google requires an offer,
 * and "Message for price" must never become an invented number.
 */
export function productLd(origin, content, product) {
  if (!(product.price > 0)) return null;
  const url = `${origin}/products/${product.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: product.name,
    url,
    ...(product.image ? { image: [absoluteUrl(origin, product.image)] } : {}),
    ...(product.description ? { description: product.description } : {}),
    ...(product.categoryName ? { category: product.categoryName } : {}),
    brand: { '@type': 'Brand', name: content['shop.name'] },
    offers: {
      '@type': 'Offer',
      url,
      price: product.price.toFixed(2),
      priceCurrency: 'NPR',
      availability: product.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: { '@id': `${origin}/#business` },
    },
  };
}

/** Script-safe JSON for <script type="application/ld+json">. */
export function jsonLdString(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
