/**
 * Storefront constants that client components need.
 *
 * Kept apart from `lib/storefront.js`, which opens the database and is
 * therefore server-only. The site's wording lives in `lib/site-content.js`
 * and is edited at /admin/website; only the shipped logo file is fixed here.
 */

export const LOGO_IMAGE = '/storefront/99-shop-by-shahana-logo.jpg';

/** The online-shop page for a category that takes orders, otherwise its public page. */
export const categoryHref = (category, onlineEnabled) => (onlineEnabled && category.onlineReady
  ? `/store/category/${category.id}`
  : `/shop/${category.slug}`);
