/** Photos bundled with the shop until a product has its own uploaded media. */
export const SEED_IMAGES = {
  'berry cloud claw clip': '/storefront/catalog/products/hair-clips/berry-cloud-claw-clip.jpg',
  'petal cloud claw clip': '/storefront/catalog/products/hair-clips/petal-cloud-claw-clip.jpg',
  'sky gingham cloud claw clip': '/storefront/catalog/products/hair-clips/sky-gingham-cloud-claw-clip.jpg',
  'blush gingham triangle claw clip': '/storefront/catalog/products/hair-clips/blush-gingham-triangle-claw-clip.jpg',
  'heart crown claw clip': '/storefront/catalog/products/hair-clips/heart-crown-claw-clip.jpg',
  'ivory bow claw clip': '/storefront/catalog/products/hair-clips/ivory-bow-claw-clip.jpg',
  'pearl & bow claw set': '/storefront/hair-claws-and-clips.jpg',
  'glazed cherry duo keychain': '/storefront/cherry-charms.jpg',
  'cherry bag charm': '/storefront/catalog/products/cherry/cherry-bag-charm.jpg',
  'mystery charm keychain mix': '/storefront/keychains-and-charms.jpg',
};

export function fallbackStorefrontImage(name) {
  return SEED_IMAGES[String(name || '').trim().toLowerCase()] || null;
}
