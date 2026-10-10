/**
 * Central factual identity for 99 Shop by Shahana.
 *
 * Sourced from the shop's own storefront page. Do NOT invent opening hours,
 * ratings, addresses, emails or social URLs — only verified fields belong here.
 * Fields the shop has not supplied are left null so the UI can omit them
 * rather than render a plausible-looking guess.
 */

export const SHOP = {
  name: '99 Shop by Shahana',
  shortName: '99 Shop',
  nepaliName: null,
  tagline: 'Kawaii accessories in Surkhet',
  intro:
    'A little accessories shop in Surkhet — hair clips, earrings, rings, nail polish, cosmetics and cute everyday trinkets, handpicked rather than mass-dumped.',
  address: {
    line: null,
    city: 'Surkhet',
    postalCode: null,
    country: 'Nepal',
    full: 'Surkhet, Nepal',
  },
  coords: null,
  phoneDisplay: '+977 976-789-6814',
  phoneE164: '+9779767896814',
  whatsappNumber: '9779767896814',
  email: null,
  social: {
    facebook: null,
    instagram: 'https://www.instagram.com/99shop_surkhet',
    tiktok: 'https://www.tiktok.com/@99shop_surkhet',
  },
  mapEmbedSrc: null,
  logo: '/storefront/99-shop-by-shahana-logo.jpg',
  storefront: [],
  themeColor: '#E8618C',
  // Override NEXT_PUBLIC_SITE_URL in production when the final domain is known.
  siteUrl: 'https://pos.example.com',
};

export function telHref() {
  return `tel:${SHOP.phoneE164}`;
}

export function mailtoHref() {
  return SHOP.email ? `mailto:${SHOP.email}` : null;
}

export function whatsappHref(message = "Hello 99 Shop! I'd like to ask about an item.") {
  return `https://wa.me/${SHOP.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

/** External "Open in Google Maps" link — search by name and city. */
export function directionsHref() {
  const q = encodeURIComponent(`${SHOP.name}, ${SHOP.address.full}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/** "Read reviews on Google" — points to the live listing rather than copying reviews. */
export function googleReviewsHref() {
  const q = encodeURIComponent(`${SHOP.name} ${SHOP.address.city}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
