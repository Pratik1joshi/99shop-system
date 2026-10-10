import { siteOrigin } from '@/lib/seo.js';

export const dynamic = 'force-dynamic';

// Product photos are served from /api/media, so that one API path stays crawlable.
export default async function robots() {
  const origin = await siteOrigin();
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/api/media/'],
      disallow: ['/api/', '/admin', '/cashier', '/login', '/store/cart', '/store/account', '/store/orders'],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
