import { getSitemapProducts, getStorefrontCategories } from '@/lib/storefront.js';
import { absoluteUrl, siteOrigin } from '@/lib/seo.js';

export const dynamic = 'force-dynamic';

/** SQLite gives UTC text without a zone, PostgreSQL gives Date objects. */
function toDate(value) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(String(value)) ? value : `${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Canonical public pages only: home, the category index and categories, products that are on sale,
 * About and Contact. Staff screens, carts and the /store preview are left out.
 * Dates come from the catalogue rows, so they change only when content does.
 */
export default async function sitemap() {
  const [origin, categories, products] = await Promise.all([siteOrigin(), getStorefrontCategories(), getSitemapProducts()]);
  const newest = [...categories.map((c) => toDate(c.updatedAt))].filter(Boolean).sort((a, b) => b - a)[0];
  return [
    { url: `${origin}/`, lastModified: newest, changeFrequency: 'weekly', priority: 1 },
    { url: `${origin}/categories`, lastModified: newest, changeFrequency: 'weekly', priority: 0.7 },
    ...categories.map((category) => ({
      url: `${origin}/shop/${category.slug}`,
      lastModified: toDate(category.updatedAt),
      changeFrequency: 'weekly',
      priority: 0.8,
      images: category.image ? [absoluteUrl(origin, category.image)] : undefined,
    })),
    ...products.map((product) => ({
      url: `${origin}/products/${product.slug}`,
      lastModified: toDate(product.updatedAt),
      changeFrequency: 'monthly',
      priority: 0.6,
      images: product.image ? [absoluteUrl(origin, product.image)] : undefined,
    })),
    { url: `${origin}/about`, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${origin}/contact`, changeFrequency: 'yearly', priority: 0.6 },
  ];
}
