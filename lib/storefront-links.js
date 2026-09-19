/**
 * Storefront constants that client components need.
 *
 * Kept apart from `lib/storefront.js`, which opens the database and is
 * therefore server-only.
 */

export const LOGO_IMAGE = '/storefront/99-shop-by-shahana-logo.jpg';

/** Pre-filled WhatsApp text for the generic "order something" buttons. */
export const GENERIC_ORDER_MESSAGE =
  "Hi 99 Shop! I'd love to order something cute from your shop 🎀";

/** Pre-filled WhatsApp text for a specific product. */
export function orderMessageFor(productName) {
  return `Hi 99 Shop! I'd love to order the ${productName} 🎀`;
}
